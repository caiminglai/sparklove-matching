const { getDb, decrypt } = require('./index');

function unlockContact(viewerId, targetId, adminNote = '') {
  const database = getDb();
  const unlockedAt = Date.now();
  const stmt = database.prepare(
    'INSERT INTO contact_unlocks (viewer_id, target_id, status, created_at, unlocked_at, admin_note) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT(viewer_id, target_id) DO UPDATE SET status = EXCLUDED.status, unlocked_at = EXCLUDED.unlocked_at, admin_note = EXCLUDED.admin_note'
  );
  stmt.run(viewerId, targetId, 'unlocked', Date.now(), unlockedAt, adminNote);
  return true;
}

function checkContactUnlocked(viewerId, targetId) {
  const database = getDb();
  const stmt = database.prepare(
    'SELECT status FROM contact_unlocks WHERE viewer_id = $1 AND target_id = $2 AND status = $3'
  );
  const result = stmt.get(viewerId, targetId, 'unlocked');
  return !!result;
}

function getAllUnlockRecords() {
  const database = getDb();
  const stmt = database.prepare(
    `SELECT cl.*, 
      u1.name as viewer_name, u1.avatar as viewer_avatar, u1.contact as viewer_contact, u1.user_id as viewer_user_id,
      u2.name as target_name, u2.avatar as target_avatar, u2.contact as target_contact, u2.user_id as target_user_id
    FROM contact_unlocks cl
    LEFT JOIN users u1 ON cl.viewer_id = u1.user_id OR cl.viewer_id = u1.id
    LEFT JOIN users u2 ON cl.target_id = u2.user_id OR cl.target_id = u2.id
    ORDER BY cl.created_at DESC LIMIT 100`
  );
  return stmt.all();
}

function addContactUnlockRequest(viewerId, targetId, proofPath, method, amount) {
  const database = getDb();
  const now = Date.now();
  try {
    // 修复：原代码用 SELECT LASTVAL() 取 id，并发下可能拿到别的 INSERT 的序列值
    // 改用 INSERT ... ON CONFLICT DO UPDATE ... RETURNING id 原子拿到 id
    const stmt = database.prepare(`
      INSERT INTO contact_unlocks (viewer_id, target_id, proof_path, method, amount, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (viewer_id, target_id) DO UPDATE SET
        proof_path = EXCLUDED.proof_path,
        method = EXCLUDED.method,
        amount = EXCLUDED.amount,
        status = EXCLUDED.status,
        created_at = EXCLUDED.created_at
      RETURNING id
    `);
    const row = stmt.get(viewerId, targetId, proofPath, method || 'manual', amount || 9.9, 'pending', now);
    return { success: true, id: row.id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getAllContactUnlockRequests() {
  const database = getDb();
  const rows = database.prepare(`
    SELECT cu.*,
      au.nickname as viewer_name, au.phone as viewer_phone,
      u.name as target_name, u.contact as target_contact, u.avatar as target_avatar,
      u.user_id as target_user_id,
      uv.avatar as viewer_avatar
    FROM contact_unlocks cu
    LEFT JOIN auth_users au ON cu.viewer_id = au.id
    LEFT JOIN users u ON cu.target_id = u.id OR cu.target_id = u.user_id
    LEFT JOIN users uv ON uv.user_id = cu.viewer_id OR uv.id = cu.viewer_id
    ORDER BY cu.created_at DESC
    LIMIT 100
  `).all();
  return rows.map(row => ({
    ...row,
    target_contact: decrypt(row.target_contact)
  }));
}

function approveContactUnlockRequest(id, adminNote = '') {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE contact_unlocks SET status = $1, unlocked_at = $2, admin_note = $3 WHERE id = $4'
  );
  stmt.run('unlocked', Date.now(), adminNote, id);
  return true;
}

function rejectContactUnlockRequest(id, adminNote = '') {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE contact_unlocks SET status = $1, admin_note = $2 WHERE id = $3'
  );
  stmt.run('rejected', adminNote, id);
  return true;
}

function deleteContactUnlockRequest(id) {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM contact_unlocks WHERE id = $1');
  stmt.run(id);
  return true;
}

function addPaymentOrder(order) {
  const database = getDb();
  const stmt = database.prepare(
    'INSERT INTO payment_orders (order_id, user_id, amount, channel, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)'
  );
  stmt.run(order.order_id, order.user_id, order.amount, order.channel, 'pending', Date.now());
  return true;
}

function getPaymentOrder(orderId) {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM payment_orders WHERE order_id = $1');
  return stmt.get(orderId);
}

function updatePaymentOrder(orderId, status) {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE payment_orders SET status = $1, paid_at = $2 WHERE order_id = $3'
  );
  stmt.run(status, status === 'paid' ? Date.now() : null, orderId);
  return true;
}

function approveDepositByUserId(userId, amount) {
  const database = getDb();
  const existingStmt = database.prepare('SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1');
  const existing = existingStmt.get(userId);
  if (existing) {
    const updateStmt = database.prepare(
      'UPDATE deposits SET status = $1, approved_at = $2, admin_note = $3 WHERE id = $4'
    );
    updateStmt.run('approved', Date.now(), '自动支付通过', existing.id);
  } else {
    const insertStmt = database.prepare(
      'INSERT INTO deposits (user_id, amount, status, created_at, approved_at, admin_note) VALUES ($1, $2, $3, $4, $5, $6)'
    );
    insertStmt.run(userId, amount, 'approved', Date.now(), Date.now(), '自动支付通过');
  }
  return true;
}

function getAllDeposits(status = null) {
  const database = getDb();
  let sql = `SELECT d.*, u.name as user_name, u.gender, u.city, u.contact, u.avatar as user_avatar
    FROM deposits d
    LEFT JOIN users u ON d.user_id = u.user_id`;
  const params = [];
  if (status) {
    sql += ' WHERE d.status = $1';
    params.push(status);
  }
  sql += ' ORDER BY d.created_at DESC';
  const stmt = database.prepare(sql);
  return stmt.all(...params);
}

function updateDepositStatus(depositId, status, adminNote = '') {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE deposits SET status = $1, admin_note = $2, approved_at = $3 WHERE id = $4'
  );
  stmt.run(status, adminNote || '', status === 'approved' ? Date.now() : null, depositId);
  return true;
}

function addDeposit(userId, amount, proofPath) {
  const database = getDb();
  const stmt = database.prepare(
    'INSERT INTO deposits (user_id, amount, proof_path, status, created_at) VALUES ($1, $2, $3, $4, $5)'
  );
  stmt.run(userId, amount, proofPath, 'pending', new Date().toISOString());
  return true;
}

function getMyDeposit(userId) {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1');
  return stmt.get(userId);
}

module.exports = {
  unlockContact,
  checkContactUnlocked,
  getAllUnlockRecords,
  addContactUnlockRequest,
  getAllContactUnlockRequests,
  approveContactUnlockRequest,
  rejectContactUnlockRequest,
  deleteContactUnlockRequest,
  addPaymentOrder,
  getPaymentOrder,
  updatePaymentOrder,
  approveDepositByUserId,
  getAllDeposits,
  updateDepositStatus,
  addDeposit,
  getMyDeposit
};