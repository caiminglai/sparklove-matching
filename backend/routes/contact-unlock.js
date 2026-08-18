// ============================================================
// API 路由层 - 联系方式解锁（含凭证上传审核）
// ============================================================

const path = require('path');
const fs = require('fs');
const dbIndex = require('../db/index.js');
const paymentsDb = require('../db/payments.js');
const adminDb = require('../db/admin.js');
const { parseMultipart, collectBody, validateMagicBytes, validateExtension } = require('../utils/multipart');

// 统一 JSON 响应工具（从 utils 抽取，避免 9 个 route 文件重复定义）
const { sendJson } = require('../utils/sendJson');

// ========== POST /api/unlock-contact/submit（用户提交解锁凭证）==========
function submitUnlockRequest(req, res) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const viewerId = token ? dbIndex.verifyToken(token) : null;
  if (!viewerId) {
    sendJson(res, 401, { success: false, message: '请先登录' }); return;
  }

  const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'contact-unlock');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const boundary = req.headers['content-type']?.split('boundary=')[1];
  if (!boundary) {
    sendJson(res, 400, { success: false, message: '无效的上传格式' }); return;
  }

  const MAX_SIZE = 5 * 1024 * 1024;
  collectBody(req, MAX_SIZE).then(body => {
    try {
      const parsed = parseMultipart(body, boundary);
      let proofPath = null;
      const targetId = parsed.fields.target_user_id || null;
      const method = parsed.fields.method || 'manual';
      const amount = parsed.fields.amount || '9.9';

      // 处理上传的文件
      for (const [fieldName, file] of Object.entries(parsed.files)) {
        const { valid, ext } = validateExtension(file.filename);
        if (!valid) continue;
        // 魔术数字校验
        if (!validateMagicBytes(file.data, ext)) {
          sendJson(res, 400, { success: false, message: '文件内容与扩展名不匹配' }); return;
        }
        const fileName = `contact_${viewerId}_${Date.now()}${ext}`;
        fs.writeFileSync(path.join(uploadsDir, fileName), file.data);
        proofPath = `/uploads/contact-unlock/${fileName}`;
      }

      if (!proofPath || !targetId) {
        sendJson(res, 400, { success: false, message: '凭证和目标用户信息必填' }); return;
      }

      const result = paymentsDb.addContactUnlockRequest(String(viewerId), targetId, proofPath, method, parseFloat(amount));
      if (result.success) {
        sendJson(res, 200, { success: true, message: '凭证提交成功，等待管理员审核', proof_path: proofPath });
      } else {
        sendJson(res, 400, { success: false, message: result.error || '提交失败' });
      }
    } catch (e) {
      sendJson(res, 500, { success: false, message: e.message });
    }
  }).catch(() => {
    sendJson(res, 500, { success: false, message: '读取请求体失败' });
  });
}

// ========== GET /api/admin/unlock-contact-requests（管理员查看列表）==========
function getUnlockRequests(req, res, checkAdminAuth) {
  if (!checkAdminAuth(req)) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  const records = paymentsDb.getAllContactUnlockRequests();
  sendJson(res, 200, { success: true, data: records });
}

// ========== PUT /api/admin/unlock-contact-requests/:id/approve ==========
function approveUnlockRequest(req, res, checkAdminAuth, readBodyWithLimit, pathname) {
  if (!checkAdminAuth(req)) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  const idMatch = pathname.match(/\/(\d+)\/approve/);
  // 防御：server.js 路由预过滤理论上保证匹配，但极端 URL 仍可能为 null
  if (!idMatch) { sendJson(res, 400, { success: false, message: '无效的请求路径' }); return; }
  const id = parseInt(idMatch[1]);
  readBodyWithLimit(req).then(body => {
    try {
      const data = JSON.parse(body);
      paymentsDb.approveContactUnlockRequest(id, data.admin_note || '');
      adminDb.logAdminAction('approve_contact_unlock', String(id), { note: data.admin_note || '' });
      sendJson(res, 200, { success: true, message: '已通过审核' });
    } catch (e) { sendJson(res, 500, { success: false, message: e.message }); }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== PUT /api/admin/unlock-contact-requests/:id/reject ==========
function rejectUnlockRequest(req, res, checkAdminAuth, readBodyWithLimit, pathname) {
  if (!checkAdminAuth(req)) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  const idMatch = pathname.match(/\/(\d+)\/reject/);
  if (!idMatch) { sendJson(res, 400, { success: false, message: '无效的请求路径' }); return; }
  const id = parseInt(idMatch[1]);
  readBodyWithLimit(req).then(body => {
    try {
      const data = JSON.parse(body);
      paymentsDb.rejectContactUnlockRequest(id, data.admin_note || '');
      adminDb.logAdminAction('reject_contact_unlock', String(id), { note: data.admin_note || '' });
      sendJson(res, 200, { success: true, message: '已拒绝' });
    } catch (e) { sendJson(res, 500, { success: false, message: e.message }); }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== DELETE /api/admin/unlock-contact-requests/:id ==========
function deleteUnlockRequest(req, res, checkAdminAuth, pathname) {
  if (!checkAdminAuth(req)) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  const idMatch = pathname.match(/\/(\d+)$/);
  if (!idMatch) { sendJson(res, 400, { success: false, message: '无效的请求路径' }); return; }
  const id = parseInt(idMatch[1]);
  paymentsDb.deleteContactUnlockRequest(id);
  adminDb.logAdminAction('delete_contact_unlock', String(id), {});
  sendJson(res, 200, { success: true, message: '已删除' });
}

// ========== POST /api/users/:id/unlock-contact（管理员手动解锁）==========
function adminUnlockContact(req, res, checkAdminAuth, readBodyWithLimit, pathname) {
  if (!checkAdminAuth(req)) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  const parts = pathname.split('/').filter(p => p);
  const userIdx = parts.indexOf('users');
  const targetId = userIdx !== -1 && userIdx + 1 < parts.length ? parts[userIdx + 1] : null;
  if (!targetId) {
    sendJson(res, 400, { success: false, message: '缺少目标用户ID' }); return;
  }
  readBodyWithLimit(req).then(body => {
    try {
      const data = JSON.parse(body);
      const viewerId = data.viewer_id || '';
      if (viewerId) paymentsDb.unlockContact(viewerId, targetId, '手动解锁');
      adminDb.logAdminAction('unlock_contact', targetId, { viewerId, action: 'admin_unlock' });
      sendJson(res, 200, { success: true, message: '解锁成功' });
    } catch (e) {
      sendJson(res, 400, { success: false, message: '请求格式错误' });
    }
  }).catch(e => {
    sendJson(res, 400, { success: false, message: e.message });
  });
}

// ========== GET /api/users/:id/check-unlock ==========
// 检查用户是否已解锁目标用户的联系方式
function checkUnlock(req, res, pathname, query) {
  const parts = pathname.split('/').filter(p => p);
  const userIdx = parts.indexOf('users');
  const targetId = userIdx !== -1 && userIdx + 1 < parts.length ? parts[userIdx + 1] : null;
  if (!targetId) {
    sendJson(res, 400, { success: false, message: '缺少目标用户ID' }); return;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendJson(res, 401, { success: false, message: '请先登录' }); return;
  }
  const viewerId = dbIndex.verifyToken(authHeader.slice(7));
  if (!viewerId) {
    sendJson(res, 401, { success: false, message: 'token无效' }); return;
  }

  // 查看自己的联系方式无需解锁
  if (String(viewerId) === String(targetId)) {
    const database = dbIndex.getDb();
    const stmt = database.prepare('SELECT contact FROM users WHERE user_id = $1 OR id = $2 LIMIT 1');
    const row = stmt.get(targetId, targetId);
    const targetContact = (row && row.contact) ? dbIndex.decrypt(row.contact) : null;
    sendJson(res, 200, { success: true, unlocked: true, contact: targetContact });
    return;
  }

  // 检查是否已解锁
  const isUnlocked = paymentsDb.checkContactUnlocked(viewerId, targetId);
  if (!isUnlocked) {
    sendJson(res, 200, { success: true, unlocked: false, contact: null, message: '请先解锁联系方式' });
    return;
  }

  // 已解锁，返回解密后的联系方式
  const database = dbIndex.getDb();
  const stmt = database.prepare('SELECT contact FROM users WHERE user_id = $1 OR id = $2 LIMIT 1');
  const row = stmt.get(targetId, targetId);
  const targetContact = (row && row.contact) ? dbIndex.decrypt(row.contact) : null;
  sendJson(res, 200, { success: true, unlocked: true, contact: targetContact });
}

// ========== GET /api/admin/unlock-records ==========
function getUnlockRecords(req, res, checkAdminAuth) {
  if (!checkAdminAuth(req)) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  const records = paymentsDb.getAllUnlockRecords();
  sendJson(res, 200, { success: true, data: records });
}

module.exports = {
  submitUnlockRequest,
  getUnlockRequests,
  approveUnlockRequest,
  rejectUnlockRequest,
  deleteUnlockRequest,
  adminUnlockContact,
  checkUnlock,
  getUnlockRecords,
};
