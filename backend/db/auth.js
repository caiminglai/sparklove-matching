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
  verifyAuthUser,
  getAuthUserById,
  getAuthUserByIdWithPassword,
  updateAuthUserPassword
};