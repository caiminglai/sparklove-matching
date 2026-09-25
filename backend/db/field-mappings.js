// ============================================================
// 数据访问层 - 字段映射（field_mappings 表，只做 SQL，不含 HTTP）
// 导出 getAllFieldMappings / getFieldLabelMap / getCacheVersion
// field_options 在库里是一个逗号拼接的字符串，读出后 split 成 options 数组，前端按数组渲染下拉选项
// getCacheVersion 取的是 MAX(updated_at)：绕过 updated_at 的改表不会让前端缓存失效，加字段时必须一并写它
// ============================================================

const { getDb } = require('./index.js');

async function getAllFieldMappings() {
  const db = getDb();
  const rows = await db.prepare(
    `SELECT field_key, field_label, field_category, field_type, field_options, field_order, is_filterable, description
     FROM field_mappings
     ORDER BY field_order ASC`
  ).all();
  return rows.map(row => ({
    field_key: row.field_key,
    field_label: row.field_label,
    field_category: row.field_category,
    field_type: row.field_type,
    options: row.field_options ? row.field_options.split(',').filter(o => o.trim()) : [],
    field_order: row.field_order,
    is_filterable: row.is_filterable === 1,
    description: row.description || ''
  }));
}

async function getFieldLabelMap() {
  const db = getDb();
  const rows = await db.prepare('SELECT field_key, field_label FROM field_mappings').all();
  const map = {};
  for (const row of rows) {
    map[row.field_key] = row.field_label;
  }
  return map;
}

async function getCacheVersion() {
  const db = getDb();
  const row = await db.prepare('SELECT MAX(updated_at) as ver FROM field_mappings').get();
  return String(row?.ver || 0);
}

module.exports = {
  getAllFieldMappings,
  getFieldLabelMap,
  getCacheVersion
};