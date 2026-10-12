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

// 解锁记录 = 一笔钱 + 两个人。viewer_id/target_id 既可能是资料行 id，也可能是账号 id（两条链路都写过），
// 所以两边都要「先按 id 认，认不到再按 user_id 认」。
// 旧写法用 OR 条件直接 JOIN：一个账号名下有 3 条资料时，同一条解锁记录会被复制成 3 行，
// 再撞上 LIMIT 100 就把 100 个名额花在重复行上。现量证据：deposits 表 5 行，同样的 OR JOIN 出 7 行。
// 换成 LEFT JOIN LATERAL ... LIMIT 1，一条记录最多配一个人。
async function getAllUnlockRecords() {
  const database = getDb();
  const stmt = database.prepare(
    `SELECT cl.*,
      v.name as viewer_name, v.avatar as viewer_avatar, v.contact as viewer_contact, v.user_id as viewer_user_id,
      t.name as target_name, t.avatar as target_avatar, t.contact as target_contact, t.user_id as target_user_id
    FROM contact_unlocks cl
    LEFT JOIN LATERAL (
      SELECT * FROM users
      WHERE id = cl.viewer_id OR user_id = cl.viewer_id
      ORDER BY (id = cl.viewer_id) DESC, created_at DESC LIMIT 1
    ) v ON TRUE
    LEFT JOIN LATERAL (
      SELECT * FROM users
      WHERE id = cl.target_id OR user_id = cl.target_id
      ORDER BY (id = cl.target_id) DESC, created_at DESC LIMIT 1
    ) t ON TRUE
    ORDER BY cl.created_at DESC LIMIT 100`
  );
  const rows = await stmt.all();
  // contact 列存的是密文，原样发给后台只会是一串解不开的字符（还会把 iv:hex 摊在页面上），
  // 这个接口只走 checkAdminAuth，管理员需要看到的是明文
  return rows.map(row => ({
    ...row,
    viewer_contact: decrypt(row.viewer_contact),
    target_contact: decrypt(row.target_contact)
  }));
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
    LEFT JOIN LATERAL (
      SELECT * FROM users
      WHERE id = cu.target_id OR user_id = cu.target_id
      ORDER BY (id = cu.target_id) DESC, created_at DESC LIMIT 1
    ) u ON TRUE
    LEFT JOIN LATERAL (
      SELECT * FROM users
      WHERE user_id = cu.viewer_id OR id = cu.viewer_id
      ORDER BY (id = cu.viewer_id) DESC, created_at DESC LIMIT 1
    ) uv ON TRUE
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
  const info = await stmt.run('unlocked', Date.now(), adminNote, id);
  // 同上：按 id 更新，行不存在时 rowCount 为 0，不能一律报成功
  return info.changes === 1;
}

async function rejectContactUnlockRequest(id, adminNote = '') {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE contact_unlocks SET status = $1, admin_note = $2 WHERE id = $3'
  );
  const info = await stmt.run('rejected', adminNote, id);
  return info.changes === 1;
}

async function deleteContactUnlockRequest(id) {
  const database = getDb();
  // RETURNING 把图片路径带出去给调用方删盘上文件（db 层不碰 fs）。
  // 返回值原来只有 proof_path，导致「记录不存在」和「记录在但没贴图」都回 null，
  // 路由对不存在的 id 也能报「已删除」；改成带 deleted 标记，调用方分得清
  const row = await database.prepare('DELETE FROM contact_unlocks WHERE id = $1 RETURNING proof_path').get(id);
  return { deleted: !!row, proofPath: row ? row.proof_path : null };
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
  // paid_at 只在改成 paid 时写，其他状态变更保留原来的支付时刻：
  // 以前是 paid_at = $2 无条件覆盖，而 $2 在非 paid 时传 null，
  // 于是将来任何一处把单子改成 refunded/failed，就会顺手抹掉「这笔钱什么时候到过」
  const stmt = database.prepare(
    `UPDATE payment_orders
        SET status = $1,
            paid_at = CASE WHEN $1 = 'paid' THEN COALESCE(payment_orders.paid_at, $2)
                           ELSE payment_orders.paid_at END,
            channel_txn_id = COALESCE($3, channel_txn_id)
      WHERE order_id = $4 AND status <> $1`
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
  //
  // 余额是「查出来的」而不是「扣出来的」，所以这条 INSERT…SELECT 里的比较必须先锁再比：
  // READ COMMITTED 下，同一账号连点两个人，两个事务各自看到的 spent 都是旧值，
  // 于是 1 次余额能解锁 2 个人。按 viewerId 加事务级咨询锁把同一账号串行化，
  // 不同账号互不阻塞；锁随事务结束自动释放，不存在忘了放的对象
  const row = await database.transaction(async (tx) => {
    await tx.prepare('SELECT pg_advisory_xact_lock(hashtext($1))').run(viewerId);
    // 先看这一对是不是已经解开了（付过钱的、管理员手动开过的都算）。
    // 撞 UNIQUE 时 INSERT…ON CONFLICT DO NOTHING 同样返回空，
    // 分不清「已经解锁」和「余额不够」这两种情况，调用方就会把前者也报成次数不足
    const existed = await tx.prepare(
      "SELECT id FROM contact_unlocks WHERE viewer_id = $1 AND target_id = $2 AND status = 'unlocked'"
    ).get(viewerId, targetId);
    if (existed) return { alreadyUnlocked: true, id: existed.id };
    return await tx.prepare(`
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
  });
  if (!row || !row.id) return { success: false, alreadyUnlocked: !!(row && row.alreadyUnlocked) };
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
  // d.user_id 是账号 id，而一个账号名下可以有多条资料行（现量：本机有账号挂 3 行）。
  // 原来这样直连，同一条缴费记录在后台「认证费审核」表里就出现 3 次——5 行缴费被列成 7 行，
  // 管理员既数不清也点不准（三个同名按钮背后是同一个 id）。LATERAL 取一条代表行就够了
  let sql = `SELECT d.*, u.name as user_name, u.gender, u.city, u.contact, u.avatar as user_avatar
    FROM deposits d
    LEFT JOIN LATERAL (
      SELECT * FROM users WHERE user_id = d.user_id ORDER BY created_at DESC LIMIT 1
    ) u ON TRUE`;
  const params = [];
  if (status) {
    sql += ' WHERE d.status = $1';
    params.push(status);
  }
  sql += ' ORDER BY d.created_at DESC';
  const stmt = database.prepare(sql);
  const rows = await stmt.all(...params);
  // contact 列是密文，后台要的是明文；原来的写法把 iv:hex 直接甩进 JSON
  return rows.map(row => ({ ...row, contact: decrypt(row.contact) }));
}

async function updateDepositStatus(depositId, status, adminNote = '') {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE deposits SET status = $1, admin_note = $2, approved_at = $3 WHERE id = $4'
  );
  const info = await stmt.run(status, adminNote || '', status === 'approved' ? Date.now() : null, depositId);
  // 原来无条件 return true：id 不存在（记录已被删）时 rowCount 是 0，
  // 但路由照样回 200「审核通过」，管理员看到成功、列表刷新后那条还在原地——
  // 只会重复点，永远不知道点的是个空位。现在按真实改动行数报
  return info.changes === 1;
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