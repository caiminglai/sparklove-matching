// ============================================================
// 业务逻辑层 - 用户服务（纯业务规则，无 SQL，无 HTTP）
// 职责：数据验证、脱敏处理、权限检查、业务流程编排
// 不直接操作数据库，通过 db/users.js 访问数据
// ============================================================

const userDb = require('../db/users');
const authDb = require('../db/auth');
const adminDb = require('../db/admin');
const { verifyToken, generateToken } = require('../db/index');

// ========== 脱敏工具（业务规则：联系方式需要脱敏后返回给前端） ==========

function maskContact(contact) {
  if (!contact) return '';
  if (/^\d{11}$/.test(contact)) {
    return contact.slice(0, 3) + '****' + contact.slice(7);
  }
  return contact.slice(0, 3) + '****' + contact.slice(-2);
}

function maskUserData(user) {
  if (!user) return user;
  const masked = { ...user };
  if (user.data && user.data.contact) {
    masked.data = { ...user.data, contact: maskContact(user.data.contact) };
  }
  return masked;
}

function maskUsers(users) {
  return users.map(maskUserData);
}

// ========== 输入验证 ==========

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

function validateIdFormat(id) {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function validateUserData(userData) {
  const errors = [];
  if (userData.id && !validateIdFormat(userData.id)) {
    errors.push('ID格式无效');
  }
  if (userData.data) {
    if (userData.data.name && userData.data.name.length > 100) {
      errors.push('姓名过长');
    }
    if (userData.data.contact && userData.data.contact.length > 200) {
      errors.push('联系方式过长');
    }
  }
  return errors;
}

// ========== 认证相关 ==========

function authenticateUser(token) {
  if (!token) return null;
  const userId = verifyToken(token);
  return userId; // 返回 auth_users 的 id
}

// ========== 用户列表（带分页和脱敏） ==========

function getUserList(page = 1, limit = 20, isAdmin = false) {
  const users = userDb.getAllUsers(page, limit);
  return isAdmin ? users : maskUsers(users);
}

function getUserStats() {
  return userDb.getUserStats();
}

function getPendingUsers() {
  return userDb.getPendingUsers();
}

// ========== 用户详情（按权限返回不同内容） ==========

function getMyUser(userId) {
  if (!userId) return null;
  const users = userDb.getUsersByUserId(userId);
  if (users.length === 0) return null;
  const user = users[0];
  user.custom_fields = userDb.getUserCustomFields(userId);
  return user;
}

// ========== 用户创建 / 更新 ==========

function createUser(userData, ownerUserId) {
  const errors = validateUserData(userData);
  if (errors.length > 0) {
    return { success: false, message: errors.join(', ') };
  }
  const newUser = {
    id: userData.id || 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    user_id: ownerUserId || null,
    deposit: userData.deposit || 0,
    createdAt: Date.now(),
    data: {
      name: sanitizeString(userData.data?.name || ''),
      gender: sanitizeString(userData.data?.gender || ''),
      age: userData.data?.age || '',
      height: userData.data?.height || '',
      weight: userData.data?.weight || '',
      city: sanitizeString(userData.data?.city || ''),
      education: sanitizeString(userData.data?.education || ''),
      job: sanitizeString(userData.data?.job || ''),
      income: sanitizeString(userData.data?.income || ''),
      contact: userData.data?.contact || '',
      avatar: sanitizeString(userData.data?.avatar || ''),
      ...userData.data
    },
    status: userData.status || 'approved'
  };
  userDb.addUser(newUser);
  return { success: true, user: newUser };
}

function updateMyUser(userId, userData) {
  if (!userId) return { success: false, message: '未登录' };
  const existing = userDb.getUsersByUserId(userId);
  if (existing.length === 0) {
    return createUser(userData, userId);
  }
  const current = existing[0];
  const updated = {
    ...current,
    data: {
      ...current.data,
      ...userData.data
    }
  };
  userDb.updateUser(current.id, updated);
  return { success: true, user: updated };
}

function editUserById(id, userData) {
  const existing = userDb.getUserById(id);
  if (!existing) return { success: false, message: '用户不存在' };
  const updated = {
    ...existing,
    ...userData,
    data: {
      ...existing.data,
      ...(userData.data || {})
    }
  };
  userDb.updateUser(id, updated);
  return { success: true, user: updated };
}

// ========== 用户删除 ==========

function removeUser(id, ownerUserId, isAdmin = false) {
  const success = userDb.deleteUser(id, ownerUserId, isAdmin);
  return { success, message: success ? '删除成功' : '无权限或用户不存在' };
}

function removeMyUser(userId) {
  if (!userId) return { success: false, message: '未登录' };
  const users = userDb.getUsersByUserId(userId);
  if (users.length === 0) return { success: false, message: '未找到关联用户' };
  const target = users[0];
  userDb.deleteUser(target.id, userId, false);
  return { success: true, message: '已删除' };
}

// ========== 审核 ==========

function approveUser(id) {
  userDb.approveUser(id);
  adminDb.logAdminAction('approve_user', id, {});
  return { success: true, message: '已通过审核' };
}

function rejectUser(id) {
  userDb.rejectUser(id);
  adminDb.logAdminAction('reject_user', id, {});
  return { success: true, message: '已拒绝' };
}

// ========== 搜索 ==========

function searchUsers(criteria, page = 1, limit = 20, isAdmin = false) {
  const result = userDb.searchUsers(criteria, page, limit);
  return {
    data: isAdmin ? result.data : maskUsers(result.data),
    count: result.count
  };
}

// ========== 批量保存 ==========

function batchSave(users, isAdmin = false) {
  if (!isAdmin) return { success: false, message: '需要管理员权限' };
  if (!Array.isArray(users) || users.length === 0) {
    return { success: false, message: '数据为空' };
  }
  userDb.batchSaveUsers(users);
  return { success: true, message: `已保存 ${users.length} 条` };
}

// ========== 管理员功能 ==========

function getAdminLogs(limit = 50) {
  return adminDb.getAdminLogs(limit);
}

module.exports = {
  // 认证
  authenticateUser,
  // 查询
  getUserList,
  getMyUser,
  getUserStats,
  getPendingUsers,
  searchUsers,
  // 增删改
  createUser,
  updateMyUser,
  editUserById,
  removeUser,
  removeMyUser,
  batchSave,
  // 审核
  approveUser,
  rejectUser,
  // 管理
  getAdminLogs,
  // 工具
  maskContact,
  sanitizeString,
  validateIdFormat
};
