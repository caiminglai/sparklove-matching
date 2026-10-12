// ============================================================
// 业务逻辑层 - 举报服务（纯业务规则，无 SQL，无 HTTP）
// ============================================================

const reportsDb = require('../db/reports');
const userDb = require('../db/users');
const { verifyToken } = require('../db/index');
const { deleteUploadedFile } = require('../utils/uploadedFiles');

// 举报类型白名单，逐字取自前端 app/src/components/ReportModal.tsx 的 REPORT_TYPES。
// report_type 是 varchar(50)，以前直连 POST 传任意长字符串会撞在 PG 的截断错误上回 500，
// 传页面四个选项以外的词则能落库——后台下拉筛不出它，那条记录在界面上等于消失
const REPORT_TYPES = ['虚假信息', '骚扰他人', '不诚信行为', '其他'];
const MAX_DESCRIPTION_LEN = 1000;

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
  if (!REPORT_TYPES.includes(reportType)) {
    return { success: false, message: '举报类型不正确' };
  }
  const normalizedDescription = typeof description === 'string' ? description.trim() : '';
  if (normalizedDescription.length > MAX_DESCRIPTION_LEN) {
    return { success: false, message: `补充说明最多${MAX_DESCRIPTION_LEN}字` };
  }
  const targetUser = await userDb.getUserById(reportedId);
  if (!targetUser) {
    return { success: false, message: '被举报用户不存在' };
  }
  // 和评价一样：一个账号名下可以挂多条资料行，原来只比 users[0].id，
  // 名下第二行就能"举报自己"——刷出一条永远不该存在的工单占住后台
  const ownedIds = new Set(users.map(u => String(u.id)));
  if (ownedIds.has(String(reportedId))) {
    return { success: false, message: '不能举报自己' };
  }
  if (typeof targetUser.user_id === 'string' && targetUser.user_id === String(userId)) {
    return { success: false, message: '不能举报自己' };
  }
  try {
    await reportsDb.addReport(users[0].id, reportedId, reportType, normalizedDescription, proofPath);
    return { success: true, message: '举报成功' };
  } catch (e) {
    return { success: false, message: '举报失败：' + (e.message || '数据库错误') };
  }
}

async function getAllReportsForAdmin(status) {
  const reports = await reportsDb.getAllReports(status);
  const mappedReports = reports.map(r => ({
    // 后台两份页面取的命名不一样（main.html 用 camelCase、m.html 用列名），这里两种都留着
    ...r,
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

// 后台四个状态值逐字取自 backend/admin/main.html 的下拉与文案（pending/processing/resolved/rejected）
const REPORT_STATUSES = ['pending', 'processing', 'resolved', 'rejected'];

async function updateStatus(reportId, status, adminNote) {
  if (!REPORT_STATUSES.includes(status)) {
    return { success: false, message: '举报状态值不正确' };
  }
  const changed = await reportsDb.updateReportStatus(reportId, status, adminNote);
  if (!changed) {
    // notFound 给路由层区分 400（参数不对）和 404（记录已经没了）
    return { success: false, notFound: true, message: '该举报记录不存在，未做改动' };
  }
  return { success: true };
}

async function removeReport(reportId) {
  const result = await reportsDb.deleteReport(reportId);
  if (!result.deleted) {
    return { success: false, notFound: true, message: '该举报记录不存在，未做改动' };
  }
  deleteUploadedFile(result.proofPath);
  return { success: true };
}

module.exports = {
  submitReport,
  getAllReportsForAdmin,
  updateStatus,
  removeReport
};
