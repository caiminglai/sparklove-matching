// ============================================================
// 数据访问层 - 用户举报（user_reports 表）
// 导出 addReport / getAllReports / updateReportStatus / deleteReport
// addReport 固定写入 status='pending'，处理进度全靠 updateReportStatus 改这一列
// getAllReports 会把被举报人的 contact（本站付费解锁字段）一并 JOIN 出来，所以只能给带 checkAdminAuth 的后台路由用，别拿到公开接口上
// deleteReport 是物理 DELETE，不是软删；删掉举报记录就查不到原始描述和证据图了。
// 它回 { deleted, proofPath }，调用方（services/reports.service.js）用 deleted 判有没有真删到，
// 再用 proofPath 删掉盘上那张证据图
// ============================================================

const { getDb } = require('./index');

async function addReport(reporterId, reportedId, reportType, description, proofPath) {
  const database = getDb();
  const createdAt = Date.now();
  const stmt = database.prepare(
    'INSERT INTO user_reports (reporter_id, reported_id, report_type, description, proof_path, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)'
  );
  await stmt.run(reporterId, reportedId, reportType, description || '', proofPath || null, 'pending', createdAt);
  return true;
}

async function getAllReports(status = null) {
  const database = getDb();
  let sql = 'SELECT r.*, u1.name as reporter_name, u1.avatar as reporter_avatar, u2.name as reported_name, u2.avatar as reported_avatar, u2.contact as reported_contact FROM user_reports r LEFT JOIN users u1 ON r.reporter_id = u1.id LEFT JOIN users u2 ON r.reported_id = u2.id';
  const params = [];
  if (status) {
    sql += ' WHERE r.status = $1';
    params.push(status);
  }
  sql += ' ORDER BY r.created_at DESC';
  const stmt = database.prepare(sql);
  return await stmt.all(...params);
}

async function updateReportStatus(reportId, status, adminNote) {
  const database = getDb();
  const stmt = database.prepare(
    'UPDATE user_reports SET status = $1, admin_note = $2, updated_at = $3 WHERE id = $4'
  );
  const info = await stmt.run(status, adminNote || '', Date.now(), reportId);
  // rowCount 为 0 说明这条工单已经不在了，不能报成功
  return info.changes === 1;
}

async function deleteReport(reportId) {
  const database = getDb();
  // RETURNING 把证据图路径带出去给调用方删盘上文件（db 层不碰 fs）。
  // 回 { deleted, proofPath }：光回 proofPath 时分不清「记录不存在」和「记录在但没贴图」，
  // 调用方（services/reports.service.js）对不存在的 id 也会报"删除成功"
  const row = await database.prepare('DELETE FROM user_reports WHERE id = $1 RETURNING proof_path').get(reportId);
  return { deleted: !!row, proofPath: row ? row.proof_path : null };
}

module.exports = {
  addReport,
  getAllReports,
  updateReportStatus,
  deleteReport
};