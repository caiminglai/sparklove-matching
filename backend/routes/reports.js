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
const { buildUploadName, deleteUploadedFile } = require('../utils/uploadedFiles');

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
        let reportedId = null, reportType = null, description = null;

        // 处理文本字段
        if (parsed.fields.reportedId) reportedId = parsed.fields.reportedId;
        if (parsed.fields.reportType) reportType = parsed.fields.reportType;
        if (parsed.fields.description) description = parsed.fields.description;

        // 处理文件：先把要落盘的那一张选出来、验完再写。
        // 旧写法在 for 里边验边写，多条文件时只有最后一张的 path 进得了库，
        // 前面几张成了盘上没人认领的孤儿图（reports 目录是匿名可下载的）
        let pendingFile = null;
        for (const [fieldName, file] of Object.entries(parsed.files)) {
          const { valid, ext } = validateExtension(file.filename);
          if (!valid) continue;
          // 魔术数字校验
          if (!validateMagicBytes(file.data, ext)) {
            sendJson(res, 400, { success: false, message: '文件内容与扩展名不匹配' });
            return;
          }
          if (!pendingFile) pendingFile = { ext, data: file.data };
        }

        let proofPath = null;
        if (pendingFile) {
          const fileName = buildUploadName('report', pendingFile.ext);
          fs.writeFileSync(path.join(uploadsDir, fileName), pendingFile.data);
          proofPath = '/uploads/reports/' + fileName;
        }

        const result = await reportsService.submitReport(token, reportedId, reportType, description, proofPath);
        // service 还要判目标是否存在、能不能举报自己、类型合不合法。
        // 这些判不过时盘上那张图没人认领，必须当场清掉，不能留在匿名可下载目录里
        if (!result.success && proofPath) deleteUploadedFile(proofPath);
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

// ========== PUT /api/reports/:id/status
// （server.js 挂在 /api/reports/:id/status，后台 main.html 与 m.html 请求的都是这个路径；
//   原来这段注释写成 /api/admin/reports/:id，照它去前端找调用方会一条都找不到）
async function updateReportStatus(req, res, checkAdminAuth, pathname) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' });
    return;
  }
  const reportId = parseInt(extractId(pathname, 'reports'));
  if (!Number.isInteger(reportId)) {
    sendJson(res, 400, { success: false, message: '无效的举报记录ID' }); return;
  }
  collectBody(req, 1024 * 1024).then(async buf => {
    try {
      const data = JSON.parse(buf.toString() || '{}');
      const result = await reportsService.updateStatus(reportId, data.status, data.adminNote);
      sendJson(res, result.success ? 200 : (result.notFound ? 404 : 400), result);
    } catch (e) { sendJson(res, 500, { success: false, message: '更新失败' }); }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== DELETE /api/reports/:id
async function deleteReport(req, res, checkAdminAuth, pathname) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' });
    return;
  }
  const reportId = parseInt(extractId(pathname, 'reports'));
  if (!Number.isInteger(reportId)) {
    sendJson(res, 400, { success: false, message: '无效的举报记录ID' }); return;
  }
  try {
    const result = await reportsService.removeReport(reportId);
    sendJson(res, result.success ? 200 : 404, result);
  } catch (e) {
    sendJson(res, 500, { success: false, message: '删除失败' });
  }
}

module.exports = { addReport, getAllReports, updateReportStatus, deleteReport };
