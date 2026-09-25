// ============================================================
// 数据访问层 - 管理员/自定义筛选字段（纯 SQL，无业务逻辑）
// ============================================================

const { getDb } = require('./index');

// ========== 管理员设置 ==========

async function getAdminPassword() {
  const database = getDb();
  const stmt = database.prepare('SELECT "value" FROM admin_settings WHERE "key" = $1');
  const row = await stmt.get('admin_password');
  return row ? row.value : null;
}

async function setAdminPassword(password) {
  const database = getDb();
  const stmt = database.prepare(
    'INSERT INTO admin_settings ("key", "value", updated_at) VALUES ($1, $2, $3) ON CONFLICT("key") DO UPDATE SET "value" = EXCLUDED."value", updated_at = EXCLUDED.updated_at'
  );
  await stmt.run('admin_password', password, Date.now());
  return true;
}

async function getAdminLogs(limit = 50) {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT $1');
  return await stmt.all(limit);
}

async function logAdminAction(action, targetId, details) {
  const database = getDb();
  const stmt = database.prepare('INSERT INTO admin_logs (action, target_id, details, created_at) VALUES ($1, $2, $3, $4)');
  await stmt.run(action, targetId || null, details ? JSON.stringify(details) : null, Date.now());
}

// ========== 管理员账号白名单 ==========

async function getAdminWhitelist() {
  const envWhitelist = process.env.ADMIN_WHITELIST || process.env.ADMIN_USERNAME || '';
  if (envWhitelist) {
    return envWhitelist.split(',').map(s => s.trim()).filter(Boolean);
  }
  const database = getDb();
  const stmt = database.prepare('SELECT "value" FROM admin_settings WHERE "key" = $1');
  const row = await stmt.get('admin_whitelist');
  if (row && row.value) {
    return row.value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

async function getAdminAccountPassword(username) {
  const database = getDb();
  const stmt = database.prepare('SELECT "value" FROM admin_settings WHERE "key" = $1');
  const row = await stmt.get('admin_password_' + username);
  return row ? row.value : null;
}

// ========== 自定义筛选字段 ==========

async function getAllCustomFilters() {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM custom_filters ORDER BY use_count DESC, created_at DESC');
  return await stmt.all();
}

async function addCustomFilter(fieldKey, fieldLabel, fieldType = 'text', description = '', fieldOptions = '') {
  const database = getDb();
  const now = Date.now();
  const existing = await database.prepare('SELECT * FROM custom_filters WHERE field_key = $1').get(fieldKey);
  if (existing) {
    const stmt = database.prepare('UPDATE custom_filters SET field_label = $1, field_type = $2, field_options = $3, description = $4, updated_at = $5 WHERE field_key = $6');
    await stmt.run(fieldLabel, fieldType, fieldOptions, description, now, fieldKey);
    return await database.prepare('SELECT * FROM custom_filters WHERE field_key = $1').get(fieldKey);
  }
  const stmt = database.prepare('INSERT INTO custom_filters (field_key, field_label, field_type, field_options, description, use_count, created_at) VALUES ($1, $2, $3, $4, $5, 0, $6) RETURNING id');
  const info = await stmt.run(fieldKey, fieldLabel, fieldType, fieldOptions, description, now);
  return await database.prepare('SELECT * FROM custom_filters WHERE id = $1').get(info.lastInsertRowid);
}

async function deleteCustomFilter(id) {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM custom_filters WHERE id = $1');
  const info = await stmt.run(id);
  return info.changes > 0;
}

module.exports = {
  getAdminPassword,
  setAdminPassword,
  getAdminLogs,
  logAdminAction,
  getAdminWhitelist,
  getAdminAccountPassword,
  getAllCustomFilters,
  addCustomFilter,
  deleteCustomFilter
};
