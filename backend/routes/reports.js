// ============================================================
// API 路由层 - 举报（只做 HTTP 解析 + 调用 Service + 返回 JSON）
// ============================================================

const reportsService = require('../services/reports.service');
const fs = require('fs');
const path = require('path');
const { parseMultipart, collectBody, validateMagicBytes, validateExtension } = require('../utils/multipart');
const { extractId } = require('../utils/extractId');
const { MAX_BODY_SIZE } = require('../utils/config');

// 统一 JSON 响应工具（从 utils 抽取，避免 9 个 route 文件重复定义）
const { sendJson } = require('../utils/sendJson');
const { buildUploadName } = require('../utils/uploadedFiles');

// ========== POST /api/reports（含 multipart 文件上传）
function addReport(req, res, readBodyWithLimit) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendJson(res, 401, { success: false, message: '未登录' });
    return;
  }
  const token = authHeader.slice(7);

  const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'reports');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const contentType = req.headers['content-type'] || '';

  // multipart 表单
  if (contentType.includes('multipart/form-data')) {
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) { sendJson(res, 400, { success: false, message: '无效的表单数据' }); return; }
    const MAX_SIZE = MAX_BODY_SIZE;
    collectBody(req, MAX_SIZE).then(async body => {
      try {
        const parsed = parseMultipart(body, boundary);
        let reportedId = null, reportType = null, description = null, proofPath = null;

        // 处理文本字段
        if (parsed.fields.reportedId) reportedId = parsed.fields.reportedId;
        if (parsed.fields.reportType) reportType = parsed.fields.reportType;
        if (parsed.fields.description) description = parsed.fields.description;

        // 处理文件
        for (const [fieldName, file] of Object.entries(parsed.files)) {
          const { valid, ext } = validateExtension(file.filename);
          if (!valid) continue;
          // 魔术数字校验
          if (!validateMagicBytes(file.data, ext)) {
            sendJson(res, 400, { success: false, message: '文件内容与扩展名不匹配' });
            return;
          }
          const fileName = buildUploadName('report', ext);
          fs.writeFileSync(path.join(uploadsDir, fileName), file.data);
          proofPath = '/uploads/reports/' + fileName;
        }

        const result = await reportsService.submitReport(token, reportedId, reportType, description, proofPath);
        sendJson(res, result.success ? 200 : 400, result);
      } catch(e) { sendJson(res, 500, { success: false, message: '举报失败' }); }
    }).catch(() => { sendJson(res, 500, { success: false, message: '读取请求体失败' }); });
    return;
  }

  // JSON - use readBodyWithLimit if available
  const readBody = readBodyWithLimit
    ? readBodyWithLimit(req)
    : new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => resolve(body));
        req.on('error', reject);
      });
  readBody.then(async body => {
    try {
      const data = JSON.parse(body || '{}');
      const result = await reportsService.submitReport(token, data.reportedId, data.reportType, data.description, null);
      sendJson(res, result.success ? 200 : 400, result);
    } catch (e) { sendJson(res, 500, { success: false, message: '举报失败' }); }
  }).catch(() => {
    sendJson(res, 500, { success: false, message: '读取请求体失败' });
  });
}

// ========== GET /api/reports
async function getAllReports(req, res, checkAdminAuth) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' });
    return;
  }
  const status = new URL(req.url, 'http://localhost').searchParams.get('status');
  const reports = await reportsService.getAllReportsForAdmin(status || null);
  sendJson(res, 200, reports);
}

// ========== PUT /api/admin/reports/:id
async function updateReportStatus(req, res, checkAdminAuth, pathname) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' });
    return;
  }
  const reportId = parseInt(extractId(pathname, 'reports'));
  collectBody(req, 1024 * 1024).then(async buf => {
    try {
      const data = JSON.parse(buf.toString() || '{}');
      const result = await reportsService.updateStatus(reportId, data.status, data.adminNote);
      sendJson(res, 200, result);
    } catch (e) { sendJson(res, 500, { success: false, message: '更新失败' }); }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== DELETE /api/admin/reports/:id
async function deleteReport(req, res, checkAdminAuth, pathname) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' });
    return;
  }
  const reportId = parseInt(extractId(pathname, 'reports'));
  const result = await reportsService.removeReport(reportId);
  sendJson(res, 200, result);
}

module.exports = { addReport, getAllReports, updateReportStatus, deleteReport };
