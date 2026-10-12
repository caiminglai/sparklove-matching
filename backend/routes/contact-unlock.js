// ============================================================
// API 路由层 - 联系方式解锁（含凭证上传审核）
// ============================================================

const path = require('path');
const fs = require('fs');
const dbIndex = require('../db/index.js');
const paymentsDb = require('../db/payments.js');
const adminDb = require('../db/admin.js');
const { parseMultipart, collectBody, validateMagicBytes, validateExtension } = require('../utils/multipart');
const { MAX_BODY_SIZE } = require('../utils/config');
const pricing = require('../utils/pricing');

// 统一 JSON 响应工具（从 utils 抽取，避免 9 个 route 文件重复定义）
const { sendJson } = require('../utils/sendJson');
const { buildUploadName, deleteUploadedFile } = require('../utils/uploadedFiles');

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

  const MAX_SIZE = MAX_BODY_SIZE;
  collectBody(req, MAX_SIZE).then(async body => {
    try {
      const parsed = parseMultipart(body, boundary);
      const targetId = parsed.fields.target_user_id || null;
      const method = parsed.fields.method || 'manual';
      // 🔴 不读 parsed.fields.amount：那是前端传来的数字，审核时看到的数额就能被提交方自己填

      // 已经解锁过的人不再收第二次凭证：重复提交会把 unlocked 那行覆写回 pending，
      // 而次数包余额正是按 unlocked 行数算的，覆写一次就等于白送回一次额度；
      // 顺带也不再往盘上多堆一张用不上的凭证图
      if (targetId && await paymentsDb.checkContactUnlocked(viewerId, targetId)) {
        sendJson(res, 200, { success: true, alreadyUnlocked: true, message: '你已解锁该联系方式，可直接查看' });
        return;
      }

      // 处理上传的文件：先把要落盘的那一张选出来、验完了再写。
      // 旧写法在 for 里边验边写，后面任何一步判不过（缺 targetId、缺凭证、多条文件）
      // 盘上都已经多了一张没人认领的图；多条文件时也只有最后一条的 path 进得了库，
      // 前面几张成了永远查不到主人的孤儿文件
      let pendingFile = null;
      for (const [fieldName, file] of Object.entries(parsed.files)) {
        const { valid, ext } = validateExtension(file.filename);
        if (!valid) continue;
        // 魔术数字校验
        if (!validateMagicBytes(file.data, ext)) {
          sendJson(res, 400, { success: false, message: '文件内容与扩展名不匹配' }); return;
        }
        if (!pendingFile) pendingFile = { ext, data: file.data };
      }

      if (!pendingFile || !targetId) {
        sendJson(res, 400, { success: false, message: '凭证和目标用户信息必填' }); return;
      }

      // 目标得真存在：不然审核列表里会出现一条谁也点不开的记录，凭证图白占盘
      const database = dbIndex.getDb();
      const targetRow = await database.prepare('SELECT 1 AS hit FROM users WHERE id = $1 OR user_id = $2 LIMIT 1')
        .get(targetId, targetId);
      if (!targetRow) {
        sendJson(res, 400, { success: false, message: '要解锁的用户不存在' }); return;
      }
      // 也不能是自己名下另一条资料：viewer_id 存的是账号 id，资料行 id 是另一个值，
      // 只比 viewerId === targetId 挡不住「拿自己另一条资料行当目标」
      const ownRow = await database.prepare('SELECT 1 AS hit FROM users WHERE (id = $1 OR user_id = $1) AND user_id = $2 LIMIT 1')
        .get(targetId, String(viewerId));
      if (ownRow) {
        sendJson(res, 400, { success: false, message: '这是你自己的资料，无需解锁' }); return;
      }

      const fileName = buildUploadName(`contact_${viewerId}`, pendingFile.ext);
      fs.writeFileSync(path.join(uploadsDir, fileName), pendingFile.data);
      const proofPath = `/uploads/contact-unlock/${fileName}`;

      const amount = await pricing.getYuan('contactUnlock');
      const result = await paymentsDb.addContactUnlockRequest(String(viewerId), targetId, proofPath, method, amount);
      if (result.success) {
        sendJson(res, 200, { success: true, message: '凭证提交成功，等待管理员审核', proof_path: proofPath });
      } else {
        // 这条请求没进库（已解锁、或插入报错），盘上那张图就没有任何记录指向它。
        // contact-unlock 目录是匿名可下的，留一张孤图等于把一个真人姓名电话的截图挂在公网上
        deleteUploadedFile(proofPath);
        if (result.alreadyUnlocked) {
          // 并发下两条提交可能同时越过上面的入口检查，被库里的 WHERE 拦住的那条走这里
          sendJson(res, 200, { success: true, alreadyUnlocked: true, message: '你已解锁该联系方式，可直接查看' });
        } else {
          sendJson(res, 400, { success: false, message: result.error || '提交失败' });
        }
      }
    } catch (e) {
      sendJson(res, 500, { success: false, message: e.message });
    }
  }).catch(() => {
    sendJson(res, 500, { success: false, message: '读取请求体失败' });
  });
}

// ========== GET /api/admin/unlock-contact-requests（管理员查看列表）==========
async function getUnlockRequests(req, res, checkAdminAuth) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  const records = await paymentsDb.getAllContactUnlockRequests();
  sendJson(res, 200, { success: true, data: records });
}

// ========== PUT /api/admin/unlock-contact-requests/:id/approve ==========
async function approveUnlockRequest(req, res, checkAdminAuth, readBodyWithLimit, pathname) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  const idMatch = pathname.match(/\/(\d+)\/approve/);
  // 防御：server.js 路由预过滤理论上保证匹配，但极端 URL 仍可能为 null
  if (!idMatch) { sendJson(res, 400, { success: false, message: '无效的请求路径' }); return; }
  const id = parseInt(idMatch[1]);
  readBodyWithLimit(req).then(async body => {
    try {
      const data = JSON.parse(body);
      const success = await paymentsDb.approveContactUnlockRequest(id, data.admin_note || '');
      if (!success) {
        sendJson(res, 404, { success: false, message: '该申请记录已不存在，未做改动' }); return;
      }
      await adminDb.logAdminAction('approve_contact_unlock', String(id), { note: data.admin_note || '' });
      sendJson(res, 200, { success: true, message: '已通过审核' });
    } catch (e) { sendJson(res, 500, { success: false, message: e.message }); }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== PUT /api/admin/unlock-contact-requests/:id/reject ==========
async function rejectUnlockRequest(req, res, checkAdminAuth, readBodyWithLimit, pathname) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  const idMatch = pathname.match(/\/(\d+)\/reject/);
  if (!idMatch) { sendJson(res, 400, { success: false, message: '无效的请求路径' }); return; }
  const id = parseInt(idMatch[1]);
  readBodyWithLimit(req).then(async body => {
    try {
      const data = JSON.parse(body);
      const success = await paymentsDb.rejectContactUnlockRequest(id, data.admin_note || '');
      if (!success) {
        sendJson(res, 404, { success: false, message: '该申请记录已不存在，未做改动' }); return;
      }
      await adminDb.logAdminAction('reject_contact_unlock', String(id), { note: data.admin_note || '' });
      sendJson(res, 200, { success: true, message: '已拒绝' });
    } catch (e) { sendJson(res, 500, { success: false, message: e.message }); }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== DELETE /api/admin/unlock-contact-requests/:id ==========
async function deleteUnlockRequest(req, res, checkAdminAuth, pathname) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  const idMatch = pathname.match(/\/(\d+)$/);
  if (!idMatch) { sendJson(res, 400, { success: false, message: '无效的请求路径' }); return; }
  const id = parseInt(idMatch[1]);
  // 驳回不删图（要留证据），只有显式删除记录才把盘上那张凭证图一起清掉
  const result = await paymentsDb.deleteContactUnlockRequest(id);
  if (!result.deleted) {
    sendJson(res, 404, { success: false, message: '该申请记录不存在，未做改动' }); return;
  }
  deleteUploadedFile(result.proofPath);
  await adminDb.logAdminAction('delete_contact_unlock', String(id), {});
  sendJson(res, 200, { success: true, message: '已删除' });
}

// ========== POST /api/users/:id/unlock-contact（管理员手动解锁）==========
async function adminUnlockContact(req, res, checkAdminAuth, readBodyWithLimit, pathname) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  const parts = pathname.split('/').filter(p => p);
  const userIdx = parts.indexOf('users');
  const targetId = userIdx !== -1 && userIdx + 1 < parts.length ? parts[userIdx + 1] : null;
  if (!targetId) {
    sendJson(res, 400, { success: false, message: '缺少目标用户ID' }); return;
  }
  readBodyWithLimit(req).then(async body => {
    try {
      const data = JSON.parse(body);
      const viewerId = String(data.viewer_id || data.viewerId || '').trim();
      // 以前 viewerId 为空时什么都不写，却照样回「解锁成功」——管理员在后台点了按钮、看到成功提示，
      // 实际一个人都没解开，而且这条成功还会进后台操作日志
      if (!viewerId) {
        sendJson(res, 400, { success: false, message: '缺少要解锁给谁（viewer_id）' }); return;
      }
      const targetRow = await dbIndex.getDb().prepare('SELECT 1 AS hit FROM users WHERE id = $1 LIMIT 1').get(targetId);
      if (!targetRow) {
        sendJson(res, 400, { success: false, message: '目标资料不存在' }); return;
      }
      await paymentsDb.unlockContact(viewerId, targetId, '手动解锁');
      await adminDb.logAdminAction('unlock_contact', targetId, { viewerId, action: 'admin_unlock' });
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
async function checkUnlock(req, res, pathname, query) {
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

  // 查看自己的联系方式无需解锁：比「账号 id === 目标」不够，还要认自己名下其他资料行
  const database = dbIndex.getDb();
  const isSelf = await database.prepare(
    'SELECT 1 AS hit FROM users WHERE (id = $1 OR user_id = $1) AND user_id = $2 LIMIT 1'
  ).get(targetId, String(viewerId));
  if (isSelf) {
    const row = await database.prepare(
      'SELECT contact FROM users WHERE id = $1 OR user_id = $1 ORDER BY (id = $1) DESC LIMIT 1'
    ).get(targetId);
    sendJson(res, 200, { success: true, unlocked: true, contact: (row && row.contact) ? dbIndex.decrypt(row.contact) : null });
    return;
  }

  // 检查是否已解锁
  const isUnlocked = await paymentsDb.checkContactUnlocked(viewerId, targetId);
  if (!isUnlocked) {
    sendJson(res, 200, { success: true, unlocked: false, contact: null, message: '请先解锁联系方式' });
    return;
  }

  // 已解锁，返回解密后的联系方式。
  // 这句必须带 ORDER BY：一个账号名下有多条资料时（现量：本机有账号挂 3 行），
  // `WHERE user_id = $1 OR id = $2 LIMIT 1` 取到哪一行由数据库决定，
  // 不加排序就可能把同账号里另一个人的号码发给解锁人
  const row = await database.prepare(
    'SELECT contact FROM users WHERE id = $1 OR user_id = $1 ORDER BY (id = $1) DESC LIMIT 1'
  ).get(targetId);
  const targetContact = (row && row.contact) ? dbIndex.decrypt(row.contact) : null;
  sendJson(res, 200, { success: true, unlocked: true, contact: targetContact });
}

// ========== GET /api/admin/unlock-records ==========
async function getUnlockRecords(req, res, checkAdminAuth) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  const records = await paymentsDb.getAllUnlockRecords();
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
