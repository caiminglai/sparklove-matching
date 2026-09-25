// ============================================================
// 数据访问层 - 认证账号（只做 auth_users 表的 SQL，不含 HTTP 与业务判定）
// 导出 createAuthUser / ensurePhoneUniqueIndex / verifyAuthUser / getAuthUserById / getAuthUserByIdWithPassword / updateAuthUserPassword
// 占位符是 PostgreSQL 的 $1 风格，不是 SQLite 的 ?，照抄到别的站会报错
// ensurePhoneUniqueIndex 建的是排除 NULL 与空串的部分唯一索引：routes/auth.js 里"该手机号已注册"靠 23505 冲突触发，没有这个索引那条分支永远走不到，同一手机号能注册出两个账号
// getAuthUserByIdWithPassword 是本文件唯一会读出密码哈希的函数，只给改密码时比对用，它的返回值严禁直接回给前端
// ============================================================

const { getDb, hashPasswordSync, verifyPasswordSync } = require('./index');

async function createAuthUser(phone, password, nickname) {
  const database = getDb();
  const id = 'u' + Date.now().toString(32) + Math.random().toString(36).substring(2, 6);
  const hashedPassword = hashPasswordSync(password);
  const createdAt = Date.now();
  const stmt = database.prepare(
    'INSERT INTO auth_users (id, phone, password, nickname, created_at) VALUES ($1, $2, $3, $4, $5)'
  );
  await stmt.run(id, phone, hashedPassword, nickname || '', createdAt);
  return id;
}

// 手机号唯一索引（幂等，启动时调用）。
// 注册链路原本没有任何重复手机号校验：service 直接 INSERT，routes/auth.js 里
// "该手机号已注册" 那个分支靠的是 23505 唯一冲突——没有索引就永远不会触发。
// 后果是同一个手机号能注册出两个账号，而 verifyAuthUser 用的是
// `WHERE phone = $1` 取一行，登录命中哪个账号变成不确定。
// 用部分索引：种子库里 phone 允许 NULL，多个 NULL 在唯一索引里互不冲突，
// 空串则会互相撞车，所以一并排除。
async function ensurePhoneUniqueIndex() {
  const database = getDb();
  await database.prepare(
    'CREATE UNIQUE INDEX IF NOT EXISTS auth_users_phone_uniq ON auth_users (phone) WHERE phone IS NOT NULL AND phone <> \'\''
  ).run();
}

async function verifyAuthUser(phone, password) {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM auth_users WHERE phone = $1');
  const user = await stmt.get(phone);
  if (!user) return null;
  const storedPassword = user.password;
  if (verifyPasswordSync(password, storedPassword)) {
    await database.prepare('UPDATE auth_users SET last_login = $1 WHERE id = $2').run(Date.now(), user.id);
    return { id: user.id, phone: user.phone, nickname: user.nickname };
  }
  return null;
}

async function getAuthUserById(id) {
  const database = getDb();
  const stmt = database.prepare('SELECT id, phone, nickname, created_at, last_login FROM auth_users WHERE id = $1');
  return (await stmt.get(id)) || null;
}

async function getAuthUserByIdWithPassword(id) {
  const database = getDb();
  const stmt = database.prepare('SELECT id, phone, password, nickname, created_at, last_login FROM auth_users WHERE id = $1');
  return (await stmt.get(id)) || null;
}

async function updateAuthUserPassword(userId, newPassword) {
  const database = getDb();
  const hashedPassword = hashPasswordSync(newPassword);
  await database.prepare('UPDATE auth_users SET password = $1 WHERE id = $2').run(hashedPassword, userId);
  return true;
}

module.exports = {
  createAuthUser,
  ensurePhoneUniqueIndex,
  verifyAuthUser,
  getAuthUserById,
  getAuthUserByIdWithPassword,
  updateAuthUserPassword
};