const dbIndex = require('../db/index.js');
const userDb = require('../db/users.js');
const paymentsDb = require('../db/payments.js');
const adminService = require('../services/admin.service');
const fs = require('fs');
const path = require('path');
// 统一使用 utils/multipart.js 的常量与解析器，避免重复定义
const { ALLOWED_IMAGE_EXTENSIONS, MAGIC_NUMBERS } = require('../utils/multipart');
const { MAX_UPLOAD_SIZE } = require('../utils/config');

// 修复：原 try { require('../data/table') } catch 永远 MODULE_NOT_FOUND，假装可配置实际恒为默认
// 改为从环境变量读取（默认 29.9）
const DEPOSIT_RULES = { amount: parseFloat(process.env.DEPOSIT_AMOUNT) || 29.9 };

// 兼容引用：内部用 ALLOWED_EXTENSIONS / MAGIC_NUMBERS 名称
const ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS;

// 统一 JSON 响应工具（从 utils 抽取，避免 9 个 route 文件重复定义）
const { sendJson } = require('../utils/sendJson');

function uploadAvatar(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendJson(res, 401, { success: false, message: '未登录' }); return;
  }
  const token = authHeader.slice(7);
  const isAdmin = adminService.isAdminToken(token);
  const userId = isAdmin ? null : dbIndex.verifyToken(token);
  if (!userId && !isAdmin) {
    sendJson(res, 401, { success: false, message: 'token无效' }); return;
  }

  const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'avatars');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const boundary = req.headers['content-type']?.split('boundary=')[1];
  if (!boundary) { sendJson(res, 400, { success: false, message: '无效的上传格式' }); return; }

  const chunks = [];
  let uploadSize = 0;
  let tooLarge = false;
  req.on('data', c => { uploadSize += c.length; if (uploadSize > MAX_UPLOAD_SIZE) tooLarge = true; chunks.push(c); });
  req.on('end', () => {
    try {
      if (tooLarge) { sendJson(res, 413, { success: false, message: '文件过大，最大允许' + (MAX_UPLOAD_SIZE / 1024 / 1024) + 'MB' }); return; }
      const buffer = Buffer.concat(chunks);
      const boundaryStr = '--' + boundary;
      const parts = [];
      let start = buffer.indexOf(boundaryStr) + boundaryStr.length;
      while (start < buffer.length) {
        const nextBoundary = buffer.indexOf(boundaryStr, start);
        if (nextBoundary === -1) break;
        parts.push(buffer.slice(start, nextBoundary - 2));
        start = nextBoundary + boundaryStr.length;
      }
      let avatarData = null;
      let filename = '';
      for (const part of parts) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        const header = part.slice(0, headerEnd).toString();
        const bodyData = part.slice(headerEnd + 4);
        if (header.includes('name="avatar"')) {
          const match = header.match(/filename="([^"]+)"/);
          filename = match ? match[1] : 'avatar.png';
          avatarData = bodyData;
        }
      }
      if (!avatarData) { sendJson(res, 400, { success: false, message: '未找到头像文件' }); return; }
      const ext = path.extname(filename).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) { sendJson(res, 400, { success: false, message: '不支持的文件类型' }); return; }
      const expectedMagic = MAGIC_NUMBERS[ext];
      if (expectedMagic && avatarData.length >= expectedMagic.length) {
        const actualMagic = avatarData.slice(0, expectedMagic.length);
        if (!actualMagic.equals(expectedMagic)) { sendJson(res, 400, { success: false, message: '文件内容与扩展名不匹配' }); return; }
      }
      const savedName = 'avatar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + ext;
      const savePath = path.join(uploadsDir, savedName);
      fs.writeFileSync(savePath, avatarData);
      const avatarUrl = '/uploads/avatars/' + savedName;
      const targetUserId = userId || null;
      if (targetUserId) {
        const users = userDb.getUsersByUserId(targetUserId);
        if (users.length > 0) {
          const existing = users[0];
          existing.data = existing.data || {};
          existing.data.avatar = avatarUrl;
          userDb.updateUser(existing.id, existing);
        }
      }
      sendJson(res, 200, { success: true, avatar: avatarUrl });
    } catch (e) { sendJson(res, 500, { success: false, message: '上传失败' }); }
  });
}

// 修复：原第三参 ADMIN_TOKEN 永远 undefined（server.js 调用时未传），且函数内未使用，删除
function uploadDepositProof(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) { sendJson(res, 401, { success: false, message: '未登录' }); return; }
  const token = authHeader.slice(7);
  const userId = dbIndex.verifyToken(token);
  if (!userId) { sendJson(res, 401, { success: false, message: 'token无效' }); return; }

  const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'deposits');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const boundary = req.headers['content-type']?.split('boundary=')[1];
  if (!boundary) { sendJson(res, 400, { success: false, message: '无效的上传格式' }); return; }

  const chunks = [];
  let uploadSize = 0;
  let tooLarge = false;
  req.on('data', c => { uploadSize += c.length; if (uploadSize > MAX_UPLOAD_SIZE) tooLarge = true; chunks.push(c); });
  req.on('end', () => {
    try {
      if (tooLarge) { sendJson(res, 413, { success: false, message: '文件过大，最大允许' + (MAX_UPLOAD_SIZE / 1024 / 1024) + 'MB' }); return; }
      const buffer = Buffer.concat(chunks);
      const boundaryStr = '--' + boundary;
      const parts = [];
      let start = buffer.indexOf(boundaryStr) + boundaryStr.length;
      while (start < buffer.length) {
        const nextBoundary = buffer.indexOf(boundaryStr, start);
        if (nextBoundary === -1) break;
        parts.push(buffer.slice(start, nextBoundary - 2));
        start = nextBoundary + boundaryStr.length;
      }
      let proofData = null;
      let filename = '';
      let amount = DEPOSIT_RULES.amount;
      for (const part of parts) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        const header = part.slice(0, headerEnd).toString();
        const bodyData = part.slice(headerEnd + 4);
        if (header.includes('name="proof"')) {
          const match = header.match(/filename="([^"]+)"/);
          filename = match ? match[1] : 'proof.png';
          proofData = bodyData;
        } else if (header.includes('name="amount"')) {
          amount = parseFloat(bodyData.toString()) || DEPOSIT_RULES.amount;
        }
      }
      if (!proofData) { sendJson(res, 400, { success: false, message: '未找到凭证文件' }); return; }
      const ext = path.extname(filename).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) { sendJson(res, 400, { success: false, message: '不支持的文件类型' }); return; }
      let magicValid = false;
      const magicBytes = MAGIC_NUMBERS[ext];
      if (magicBytes && proofData.length >= magicBytes.length) {
        magicValid = magicBytes.every((byte, i) => proofData[i] === byte);
      }
      if (!magicValid) { sendJson(res, 400, { success: false, message: '文件内容不匹配' }); return; }
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const safeFilename = userId + '_' + timestamp + '_' + randomStr + ext;
      const filepath = path.join(uploadsDir, safeFilename);
      fs.writeFileSync(filepath, proofData);
      const proofPath = '/uploads/deposits/' + safeFilename;
      const depositRecord = { user_id: userId, amount: amount, proof_path: proofPath, status: 'pending', created_at: timestamp };
      paymentsDb.addDeposit(userId, amount, proofPath);
      sendJson(res, 200, { success: true, message: '凭证已提交，等待审核', data: depositRecord });
    } catch (err) { sendJson(res, 500, { success: false, message: '上传失败: ' + err.message }); }
  });
}

function serveUploadedFile(req, res, pathname) {
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
  const relativePath = pathname.replace(/^\/uploads\//, '');
  const filePath = path.join(uploadsDir, relativePath);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(uploadsDir) + path.sep) && resolvedPath !== path.resolve(uploadsDir)) {
    res.writeHead(403, {'Content-Type': 'text/plain; charset=utf-8'}); res.end('Forbidden'); return;
  }
  if (fs.existsSync(resolvedPath)) {
    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
    res.writeHead(200, {'Content-Type': mimeTypes[ext] || 'application/octet-stream'});
    fs.createReadStream(resolvedPath).pipe(res);
  } else {
    res.writeHead(404, {'Content-Type': 'text/plain'}); res.end('Not Found');
  }
}

function getDeposits(req, res, checkAdminAuth) {
  if (!checkAdminAuth(req)) { sendJson(res, 401, { success: false, message: '需要管理员权限' }); return; }
  const parsedUrl = require('url').parse(req.url, true);
  const status = parsedUrl.query.status || '';
  try {
    const records = paymentsDb.getAllDeposits(status);
    sendJson(res, 200, { success: true, data: records });
  } catch (err) { sendJson(res, 500, { success: false, message: '服务器错误' }); }
}

function approveDeposit(req, res, readBodyWithLimit, checkAdminAuth, pathname) {
  if (!checkAdminAuth(req)) { sendJson(res, 401, { success: false, message: '需要管理员权限' }); return; }
  const match = pathname.match(/\/api\/admin\/deposits\/(\d+)\/approve/);
  if (!match) { sendJson(res, 400, { success: false, message: '无效的请求' }); return; }
  const id = match[1];
  readBodyWithLimit(req).then(body => {
    try {
      const data = JSON.parse(body || '{}');
      const adminNote = data.admin_note || '审核通过';
      const success = paymentsDb.updateDepositStatus(id, 'approved', adminNote);
      if (success) {
        sendJson(res, 200, { success: true, message: '审核通过' });
      } else {
        sendJson(res, 400, { success: false, message: '审核失败' });
      }
    } catch (err) { sendJson(res, 500, { success: false, message: '操作失败' }); }
  }).catch(err => { sendJson(res, 400, { success: false, message: err.message }); });
}

function rejectDeposit(req, res, readBodyWithLimit, checkAdminAuth, pathname) {
  if (!checkAdminAuth(req)) { sendJson(res, 401, { success: false, message: '需要管理员权限' }); return; }
  const match = pathname.match(/\/api\/admin\/deposits\/(\d+)\/reject/);
  if (!match) { sendJson(res, 400, { success: false, message: '无效的请求' }); return; }
  const id = match[1];
  readBodyWithLimit(req).then(body => {
    try {
      const data = JSON.parse(body || '{}');
      const adminNote = data.admin_note || '审核未通过';
      const success = paymentsDb.updateDepositStatus(id, 'rejected', adminNote);
      if (success) {
        sendJson(res, 200, { success: true, message: '已拒绝' });
      } else {
        sendJson(res, 400, { success: false, message: '操作失败' });
      }
    } catch (err) { sendJson(res, 500, { success: false, message: '操作失败' }); }
  }).catch(err => { sendJson(res, 400, { success: false, message: err.message }); });
}

function getMyDeposit(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) { sendJson(res, 401, { success: false, message: '未登录' }); return; }
  const token = authHeader.slice(7);
  const userId = dbIndex.verifyToken(token);
  if (!userId) { sendJson(res, 401, { success: false, message: 'token无效' }); return; }
  try {
    const record = paymentsDb.getMyDeposit(userId);
    sendJson(res, 200, { success: true, data: record || null });
  } catch (err) { sendJson(res, 500, { success: false, message: '服务器错误' }); }
}

function getDepositProofById(req, res, checkAdminAuth, pathname) {
  if (!checkAdminAuth(req)) { sendJson(res, 401, { success: false, message: '需要管理员权限' }); return; }
  const id = parseInt(pathname.split('/').pop());
  if (!id || isNaN(id)) { sendJson(res, 400, { success: false, message: '无效的 ID' }); return; }
  try {
    const database = require('../db/index').getDb();
    const record = database.prepare('SELECT * FROM deposits WHERE id = $1').get(id);
    if (!record) { sendJson(res, 404, { success: false, message: '记录不存在' }); return; }
    if (record.proof_path && !/\.[a-zA-Z0-9]+$/.test(record.proof_path)) {
      const depositsDir = path.join(__dirname, '..', '..', 'uploads', 'deposits');
      const baseName = String(record.proof_path).replace(/^.*\//, '');
      if (fs.existsSync(depositsDir)) {
        const files = fs.readdirSync(depositsDir).filter(f => f.includes(baseName));
        if (files.length > 0) {
          record.proof_path = '/uploads/deposits/' + files[0];
        }
      }
    }
    sendJson(res, 200, { success: true, data: record });
  } catch (err) { sendJson(res, 500, { success: false, message: '服务器错误' }); }
}

function deleteDeposit(req, res, checkAdminAuth, pathname) {
  if (!checkAdminAuth(req)) { sendJson(res, 401, { success: false, message: '需要管理员权限' }); return; }
  const id = parseInt(pathname.split('/').pop());
  if (!id || isNaN(id)) { sendJson(res, 400, { success: false, message: '无效的 ID' }); return; }
  try {
    const database = require('../db/index').getDb();
    const record = database.prepare('SELECT * FROM deposits WHERE id = $1').get(id);
    if (!record) { sendJson(res, 404, { success: false, message: '记录不存在' }); return; }
    const result = database.prepare('DELETE FROM deposits WHERE id = $1').run(id);
    if (result.changes > 0) {
      sendJson(res, 200, { success: true, message: '删除成功' });
    } else {
      sendJson(res, 500, { success: false, message: '删除失败' });
    }
  } catch (err) { sendJson(res, 500, { success: false, message: '服务器错误' }); }
}

module.exports = { uploadAvatar, uploadDepositProof, serveUploadedFile, getDeposits, approveDeposit, rejectDeposit, getMyDeposit, getDepositProofById, deleteDeposit };
