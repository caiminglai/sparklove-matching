const { getDb, decrypt } = require('./index');

async function unlockContact(viewerId, targetId, adminNote = '') {
  const database = getDb();
  const unlockedAt = Date.now();
  const stmt = database.prepare(
    'INSERT INTO contact_unlocks (viewer_id, target_id, status, created_at, unlocked_at, admin_note) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT(viewer_id, target_id) DO UPDATE SET status = EXCLUDED.status, unlocked_at = EXCLUDED.unlocked_at, admin_note = EXCLUDED.admin_note'
  );
  await stmt.run(viewerId, targetId, 'unlocked', Date.now(), unlockedAt, adminNote);
  return true;
}

async function checkContactUnlocked(viewerId, targetId) {
  const database = getDb();
  const stmt = database.prepare(
    'SELECT status FROM contact_unlocks WHERE viewer_id = $1 AND target_id = $2 AND status = $3'
  );
  const result = await stmt.get(viewerId, targetId, 'unlocked');
  return !!result;
}

async function getAllUnlockRecords() {
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
  return await stmt.all();
}

async function addContactUnlockRequest(viewerId, targetId, proofPath, method, amount) {
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
      WHERE contact_unlocks.status <> 'unlocked'
      RETURNING id
    `);
    const row = await stmt.get(viewerId, targetId, proofPath, method || 'manual', amount, 'pending', now);
    // 已解锁的那行被上面的 WHERE 拦住，不会被覆写回 pending；此时语句一行也没改，
    // RETURNING 自然为空 —— 次数包的余额是按 unlocked 行数推导的，一旦覆写就等于把
    // 用户已经花掉的次数白送回去，所以这里只报"已解锁"，绝不返回一个假成功
    if (!row) return { success: false, alreadyUnlocked: true };
    return { success: true, id: row.id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function getAllContactUnlockRequests() {
  const database = getDb();
  const rows = await database.prepare(`
    SELECT cu.*,
      au.nickname as viewer_name, au.phone as viewer_phone,
      u.name as target_name, u.contact as target_contact, u.avatar as target_avatar,
      u.user_id as target_user_id,
      uv.avatar as viewer_avatar,
      uv.name as viewer_profile_name
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

async function approveContactUnlockRequest(id, adminNote = '') {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE contact_unlocks SET status = $1, unlocked_at = $2, admin_note = $3 WHERE id = $4'
  );
  await stmt.run('unlocked', Date.now(), adminNote, id);
  return true;
}

async function rejectContactUnlockRequest(id, adminNote = '') {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE contact_unlocks SET status = $1, admin_note = $2 WHERE id = $3'
  );
  await stmt.run('rejected', adminNote, id);
  return true;
}

async function deleteContactUnlockRequest(id) {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM contact_unlocks WHERE id = $1');
  await stmt.run(id);
  return true;
}

async function addPaymentOrder(order) {
  const database = getDb();
  const stmt = database.prepare(
    'INSERT INTO payment_orders (order_id, user_id, amount, channel, status, created_at, purpose, target_id, credits) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)'
  );
  await stmt.run(
    order.order_id, order.user_id, order.amount, order.channel, 'pending', Date.now(),
    order.purpose || 'deposit', order.target_id || null, order.credits || 0
  );
  return true;
}

async function getPaymentOrder(orderId) {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM payment_orders WHERE order_id = $1');
  return await stmt.get(orderId);
}

async function updatePaymentOrder(orderId, status, channelTxnId = null) {
  const database = getDb();
  // 状态守卫必须写进 UPDATE 本身：调用方先 SELECT 再 UPDATE 不是原子的，
  // 渠道重推或并发通知两条都能读到 pending，于是各发一次货。
  // 带上 status <> $1 后同一笔只有一个请求能拿到 rowCount=1，其余回 0。
  const stmt = database.prepare(
    'UPDATE payment_orders SET status = $1, paid_at = $2, channel_txn_id = COALESCE($3, channel_txn_id) WHERE order_id = $4 AND status <> $1'
  );
  const result = await stmt.run(status, status === 'paid' ? Date.now() : null, channelTxnId, orderId);
  return result.changes === 1;
}

// 种子库里的 payment_orders 没有渠道流水号列，启动期幂等补上，老库不用手工迁移
async function ensurePaymentColumns() {
  const database = getDb();
  await database.prepare(
    'ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS channel_txn_id text'
  ).run();
  // 一笔订单要能回答"付完该解锁什么"，所以用途和被解锁对象都得进库
  await database.prepare(
    'ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS purpose text'
  ).run();
  await database.prepare(
    'ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS target_id text'
  ).run();
  // 次数包买到的次数记在下单那一刻，后台以后改包容量也不会追改已购用户的次数
  await database.prepare(
    'ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS credits integer'
  ).run();
}

// 余额只由两张现成表推导：已付次数包给了多少、用次数解锁过多少人。
// 不另建余额表，就不会出现"余额表和解锁记录对不上"这种没人发现得了的账
async function getContactCreditBalance(userId) {
  const database = getDb();
  const row = await database.prepare(`
    SELECT
      COALESCE((SELECT SUM(credits) FROM payment_orders
                WHERE user_id = $1 AND status = 'paid' AND COALESCE(credits, 0) > 0), 0) AS granted,
      COALESCE((SELECT COUNT(*) FROM contact_unlocks
                WHERE viewer_id = $1 AND status = 'unlocked' AND method = 'pack'), 0) AS spent
  `).get(userId);
  const granted = Number(row && row.granted) || 0;
  const spent = Number(row && row.spent) || 0;
  return { granted, spent, available: Math.max(granted - spent, 0) };
}

/** 花一次次数解锁一个人；余额不够就一行都写不进去，回 { success: false } */
async function trySpendContactCredit(viewerId, targetId) {
  const database = getDb();
  const now = Date.now();
  // 占位符显式带类型：同一参数既进 INSERT 列表又进 WHERE 子查询时，PG 会报
  // "inconsistent types deduced for parameter"，整条语句根本执行不了
  const row = await database.prepare(`
    INSERT INTO contact_unlocks (viewer_id, target_id, method, status, created_at, unlocked_at)
    SELECT $1::text, $2::text, 'pack', 'unlocked', $3::bigint, $3::bigint
    WHERE (
      SELECT COALESCE(SUM(credits), 0)::bigint FROM payment_orders
      WHERE user_id = $1::text AND status = 'paid' AND COALESCE(credits, 0) > 0
    ) > (
      SELECT COUNT(*)::bigint FROM contact_unlocks
      WHERE viewer_id = $1::text AND status = 'unlocked' AND method = 'pack'
    )
    ON CONFLICT (viewer_id, target_id) DO NOTHING
    RETURNING id
  `).get(viewerId, targetId, now);
  if (!row) return { success: false };
  const balance = await getContactCreditBalance(viewerId);
  return { success: true, id: row.id, ...balance };
}

async function approveDepositByUserId(userId, amount) {
  const database = getDb();
  const existingStmt = database.prepare('SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1');
  const existing = await existingStmt.get(userId);
  if (existing) {
    const updateStmt = database.prepare(
      'UPDATE deposits SET status = $1, approved_at = $2, admin_note = $3, amount = $5 WHERE id = $4'
    );
    await updateStmt.run('approved', Date.now(), '自动支付通过', existing.id, amount);
  } else {
    const insertStmt = database.prepare(
      'INSERT INTO deposits (user_id, amount, status, created_at, approved_at, admin_note) VALUES ($1, $2, $3, $4, $5, $6)'
    );
    await insertStmt.run(userId, amount, 'approved', Date.now(), Date.now(), '自动支付通过');
  }
  return true;
}

async function getAllDeposits(status = null) {
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
  return await stmt.all(...params);
}

async function updateDepositStatus(depositId, status, adminNote = '') {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE deposits SET status = $1, admin_note = $2, approved_at = $3 WHERE id = $4'
  );
  await stmt.run(status, adminNote || '', status === 'approved' ? Date.now() : null, depositId);
  return true;
}

async function addDeposit(userId, amount, proofPath) {
  const database = getDb();
  const stmt = database.prepare(
    'INSERT INTO deposits (user_id, amount, proof_path, status, created_at) VALUES ($1, $2, $3, $4, $5)'
  );
  await stmt.run(userId, amount, proofPath, 'pending', Date.now());
  return true;
}

async function getMyDeposit(userId) {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1');
  return await stmt.get(userId);
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
  ensurePaymentColumns,
  getContactCreditBalance,
  trySpendContactCredit,
  approveDepositByUserId,
  getAllDeposits,
  updateDepositStatus,
  addDeposit,
  getMyDeposit
};