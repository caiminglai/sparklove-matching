const { getDb } = require('./index.js');

function getAllFieldMappings() {
  const db = getDb();
  const rows = db.prepare(
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

function getFieldLabelMap() {
  const db = getDb();
  const rows = db.prepare('SELECT field_key, field_label FROM field_mappings').all();
  const map = {};
  for (const row of rows) {
    map[row.field_key] = row.field_label;
  }
  return map;
}

function getCacheVersion() {
  const db = getDb();
  const row = db.prepare('SELECT MAX(updated_at) as ver FROM field_mappings').get();
  return String(row?.ver || 0);
}

module.exports = {
  getAllFieldMappings,
  getFieldLabelMap,
  getCacheVersion
};