// ============================================================
// 业务逻辑层 - 举报服务（纯业务规则，无 SQL，无 HTTP）
// ============================================================

const reportsDb = require('../db/reports');
const userDb = require('../db/users');
const { verifyToken } = require('../db/index');

async function submitReport(token, reportedId, reportType, description, proofPath) {
  const userId = verifyToken(token);
  if (!userId) {
    return { success: false, message: 'token无效' };
  }
  const users = await userDb.getUsersByUserId(userId);
  if (users.length === 0) {
    return { success: false, message: '请先创建个人资料' };
  }
  if (!reportedId || !reportType) {
    return { success: false, message: '缺少参数' };
  }
  const targetUser = await userDb.getUserById(reportedId);
  if (!targetUser) {
    return { success: false, message: '被举报用户不存在' };
  }
  if (reportedId === users[0].id) {
    return { success: false, message: '不能举报自己' };
  }
  try {
    await reportsDb.addReport(users[0].id, reportedId, reportType, description, proofPath);
    return { success: true, message: '举报成功' };
  } catch (e) {
    return { success: false, message: '举报失败：' + (e.message || '数据库错误') };
  }
}

async function getAllReportsForAdmin(status) {
  const reports = await reportsDb.getAllReports(status);
  const mappedReports = reports.map(r => ({
    id: r.id,
    reporterId: r.reporter_id,
    reportedId: r.reported_id,
    reportedName: r.reported_name || r.reportedName || '未知',
    reportedAvatar: r.reported_avatar || r.reportedAvatar || '',
    reportType: r.report_type || r.reportType,
    description: r.description,
    proof_path: r.proof_path,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    adminNote: r.admin_note
  }));
  return mappedReports;
}

async function updateStatus(reportId, status, adminNote) {
  await reportsDb.updateReportStatus(reportId, status, adminNote);
  return { success: true };
}

async function removeReport(reportId) {
  await reportsDb.deleteReport(reportId);
  return { success: true };
}

module.exports = {
  submitReport,
  getAllReportsForAdmin,
  updateStatus,
  removeReport
};
