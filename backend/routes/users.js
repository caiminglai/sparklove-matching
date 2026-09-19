// ============================================================
// API 路由层 - 用户相关（只做 HTTP 解析 + 调用 Service + 返回 JSON）
// 职责：解析 URL 参数、请求体、权限检查、响应 JSON
// 不直接操作数据库，通过 userService 处理业务逻辑
// ============================================================

const userService = require('../services/user.service');
const { parseMultipart, validateMagicBytes, collectBody } = require('../utils/multipart');
const adminService = require('../services/admin.service');
const { verifyToken } = require('../db/index');
const { getAuthTokenFromCookie } = require('../utils/cookie工具');
const { extractId } = require('../utils/extractId');

// 统一 JSON 响应工具（从 utils 抽取，避免 9 个 route 文件重复定义）
const { sendJson } = require('../utils/sendJson');

// 从请求头获取认证信息（优先 Authorization header，回退 httpOnly cookie）
async function getAuthInfo(req) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    token = getAuthTokenFromCookie(req);
  }
  if (!token) return { isAdmin: false, userId: null, token: null };
  const isAdmin = await adminService.isAdminToken(token);
  return {
    isAdmin, userId: isAdmin ? null : verifyToken(token), token };
}

// ========== GET /api/users（用户列表 + keyword 搜索）
async function getUsers(req, res, _, parsedUrl) {
  const authInfo = await getAuthInfo(req);
  const isLoggedIn = !!(authInfo.userId || authInfo.isAdmin);

  const page = parseInt(parsedUrl.query.page) || 1;
  let limit = parseInt(parsedUrl.query.limit) || 20;
  const keyword = parsedUrl.query.keyword;
  const exact = parsedUrl.query.exact;

  let result, total;

  if (keyword) {
    const criteria = { keyword, exact };
    const searchResult = await userService.searchUsers(criteria, page, limit, authInfo.isAdmin);
    result = searchResult.data;
    total = searchResult.count;
  } else {
    if (authInfo.isAdmin) {
      limit = 10000;
    } else if (!isLoggedIn) {
      if (limit > 20) limit = 20;
    } else if (limit > 50) {
      limit = 50;
    }
    result = await userService.getUserList(page, limit, authInfo.isAdmin);
    total = (await userService.getUserStats()).total;
  }

  sendJson(res, 200, { success: true, data: result, total });
}

// ========== POST /api/users（创建用户）
function addUser(req, res, readBodyWithLimit) {
  return readBodyWithLimit(req).then(async body => {
    try {
      const data = JSON.parse(body);
      const authInfo = await getAuthInfo(req);

      if (authInfo.isAdmin) {
        const result = await userService.createUser(data, null);
        if (result.success) {
          sendJson(res, 200, result);
        } else {
          sendJson(res, 400, result);
        }
        return;
      }
      if (authInfo.userId) {
        const result = await userService.createUser(data, authInfo.userId);
        if (result.success) {
          sendJson(res, 200, result);
        } else {
          sendJson(res, 400, result);
        }
        return;
      }
      sendJson(res, 401, { success: false, message: '需要登录' });
    } catch (e) {
      sendJson(res, 500, { success: false, message: '添加失败' });
    }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== POST /api/users/batch（批量保存用户）
async function batchSaveUsers(req, res, readBodyWithLimit, checkAdminAuth) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' });
    return;
  }
  return readBodyWithLimit(req).then(async body => {
    try {
      const data = JSON.parse(body);
      if (!Array.isArray(data)) {
        sendJson(res, 400, { success: false, message: '数据格式错误' });
        return;
      }
      const result = await userService.batchSave(data, true);
      if (result.success) {
        sendJson(res, 200, { success: true, count: data.length });
      } else {
        sendJson(res, 400, result);
      }
    } catch (e) {
      sendJson(res, 500, { success: false, message: '批量保存失败' });
    }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== GET /api/users/my（获取当前登录用户）
async function getMyUser(req, res) {
  const authInfo = await getAuthInfo(req);
  if (!authInfo.token) {
    sendJson(res, 401, { success: false, message: '未登录' });
    return;
  }
  if (!authInfo.userId && !authInfo.isAdmin) {
    sendJson(res, 401, { success: false, message: 'token无效' });
    return;
  }
  const user = await userService.getMyUser(authInfo.userId);
  sendJson(res, 200, { success: true, user });
}

// ========== PUT /api/users/my（更新当前用户）
function updateMyUser(req, res, readBodyWithLimit) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendJson(res, 401, { success: false, message: '未登录' });
    return;
  }
  const token = authHeader.slice(7);
  const userId = verifyToken(token);
  if (!userId) {
    sendJson(res, 401, { success: false, message: 'token无效' });
    return;
  }
  return readBodyWithLimit(req).then(async body => {
    try {
      const data = JSON.parse(body);
      const result = await userService.updateMyUser(userId, data);
      if (result.success) {
        sendJson(res, 200, result);
      } else {
        sendJson(res, 404, result);
      }
    } catch (e) {
      sendJson(res, 500, { success: false, message: '更新失败' });
    }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== DELETE /api/users/my（删除当前用户）
async function deleteMyUser(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendJson(res, 401, { success: false, message: '未登录' });
    return;
  }
  const token = authHeader.slice(7);
  const userId = verifyToken(token);
  if (!userId) {
    sendJson(res, 401, { success: false, message: 'token无效' });
    return;
  }
  const result = await userService.removeMyUser(userId);
  if (result.success) {
    sendJson(res, 200, result);
  } else {
    sendJson(res, 404, result);
  }
}

// ========== PUT /api/users/:id（管理员编辑用户）
async function editUser(req, res, readBodyWithLimit, checkAdminAuth, pathname) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' });
    return;
  }

  const id = extractId(pathname, 'users');
  if (!id || !userService.validateIdFormat(id)) {
    sendJson(res, 400, { success: false, message: '无效的用户ID' });
    return;
  }

  const contentType = req.headers['content-type'] || '';

  // 处理 multipart/form-data（带文件上传）
  if (contentType.includes('multipart/form-data')) {
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      sendJson(res, 400, { success: false, message: '无效的表单数据' });
      return;
    }
    return collectBody(req, 5 * 1024 * 1024).then(async body => {
      try {
        const data = parseMultipart(body, boundary);
        const fields = {};
        if (data.fields.name) fields.name = userService.sanitizeString(data.fields.name).substring(0, 50);
        if (data.fields.gender) fields.gender = userService.sanitizeString(data.fields.gender).substring(0, 10);
        if (data.fields.age) fields.age = userService.sanitizeString(data.fields.age).substring(0, 10);
        if (data.fields.city) fields.city = userService.sanitizeString(data.fields.city).substring(0, 50);
        if (data.fields.contact) fields.contact = userService.sanitizeString(data.fields.contact).substring(0, 100);

        if (data.files.avatar) {
          const fs = require('fs');
          const path = require('path');
          const avatarDir = path.join(__dirname, '..', '..', 'uploads', 'avatars');
          if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });
          const ext = data.files.avatar.filename.split('.').pop() || 'jpg';
          const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
          if (!allowedExts.includes(ext.toLowerCase())) {
            sendJson(res, 400, { success: false, message: '不支持的文件格式' });
            return;
          }
          if (data.files.avatar.data.length > 5 * 1024 * 1024) {
            sendJson(res, 400, { success: false, message: '文件过大，最大支持5MB' });
            return;
          }
          // 魔术数字校验：防止伪造扩展名的恶意文件
          if (!validateMagicBytes(data.files.avatar.data, '.' + ext)) {
            sendJson(res, 400, { success: false, message: '文件内容与扩展名不匹配' });
            return;
          }
          const avatarName = `${id}.${ext}`;
          fs.writeFileSync(path.join(avatarDir, avatarName), data.files.avatar.data);
          fields.avatar = `/uploads/avatars/${avatarName}`;
        }

        const result = await userService.editUserById(id, { data: fields });
        sendJson(res, 200, result);
      } catch (e) {
        sendJson(res, 500, { success: false, message: '编辑失败: ' + e.message });
      }
    }).catch(e => {
      sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
    });
  }

  // 处理 JSON
  return readBodyWithLimit(req).then(async body => {
    try {
      const data = JSON.parse(body);
      const result = await userService.editUserById(id, data);
      sendJson(res, 200, result);
    } catch (e) {
      sendJson(res, 500, { success: false, message: '编辑失败' });
    }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== DELETE /api/users/:id（删除用户）
async function deleteUser(req, res, checkAdminAuth, pathname) {
  const authInfo = await getAuthInfo(req);
  const id = pathname.split('/')[3];
  if (!id || !userService.validateIdFormat(id)) {
    sendJson(res, 400, { success: false, message: '无效的用户ID' });
    return;
  }
  // 必须登录
  if (!authInfo.userId && !authInfo.isAdmin) {
    sendJson(res, 401, { success: false, message: '需要登录' });
    return;
  }
  const result = await userService.removeUser(id, authInfo.userId, authInfo.isAdmin);
  sendJson(res, result.success ? 200 : 403, result);
}

// ========== GET /api/users/pending（待审核用户列表）
async function getPendingUsers(req, res, checkAdminAuth) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' });
    return;
  }
  const users = await userService.getPendingUsers();
  sendJson(res, 200, { success: true, data: users });
}

// ========== POST /api/users/:id/approve（通过审核）
async function approveUser(req, res, checkAdminAuth, pathname) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' });
    return;
  }
  const id = pathname.split('/')[3];
  if (!id || !userService.validateIdFormat(id)) {
    sendJson(res, 400, { success: false, message: '无效的用户ID' });
    return;
  }
  const result = await userService.approveUser(id);
  sendJson(res, 200, result);
}

// ========== POST /api/users/:id/reject（拒绝审核）
async function rejectUser(req, res, checkAdminAuth, pathname) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' });
    return;
  }
  const id = pathname.split('/')[3];
  if (!id || !userService.validateIdFormat(id)) {
    sendJson(res, 400, { success: false, message: '无效的用户ID' });
    return;
  }
  const result = await userService.rejectUser(id);
  sendJson(res, 200, result);
}

// ========== GET /api/users/search（搜索用户）
async function searchUsers(req, res, parsedUrl) {
  const criteria = { ...parsedUrl.query };
  for (const [key, value] of Object.entries(criteria)) {
    if (typeof value === 'string') {
      criteria[key] = userService.sanitizeString(value);
    }
  }
  // 自定义字段：前端以 JSON 字符串传递，需解析为数组
  if (typeof criteria.custom_fields === 'string') {
    try { criteria.custom_fields = JSON.parse(criteria.custom_fields); }
    catch { criteria.custom_fields = []; }
  }
  const page = parseInt(criteria.page) || 1;
  const limit = Math.min(parseInt(criteria.limit) || 20, 100);
  const result = await userService.searchUsers(criteria, page, limit, false);
  sendJson(res, 200, { success: true, ...result });
}

// 注：原 routes/users.js 内部 parseMultipart 实现已删除（死代码），
// 所有 multipart 解析统一使用 utils/multipart.js 的 parseMultipart（Buffer 安全版）

module.exports = {
  getUsers, addUser, batchSaveUsers, getMyUser, updateMyUser, deleteMyUser,
  editUser, deleteUser, getPendingUsers, approveUser, rejectUser, searchUsers
};
