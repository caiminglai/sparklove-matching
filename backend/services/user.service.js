// ============================================================
// 业务逻辑层 - 用户服务（纯业务规则，无 SQL，无 HTTP）
// 职责：数据验证、脱敏处理、权限检查、业务流程编排
// 不直接操作数据库，通过 db/users.js 访问数据
// ============================================================

const userDb = require('../db/users');
const authDb = require('../db/auth');
const adminDb = require('../db/admin');
const paymentsDb = require('../db/payments');
const { verifyToken, generateToken } = require('../db/index');
const { deleteUploadedFile } = require('../utils/uploadedFiles');

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
  // 认证费余额属于财务信息，只有管理端需要，非管理端一律不下发
  delete masked.deposit;
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

// 这几项由服务端掌握，绝不能由请求体里的 data 带进来。
// 以前 data 里塞一个 user_id / deposit / created_at 会被 db/users.js 当成「不是资料列」
// 原封写进 extra_data，再被 dbRowToJson 用 ...extraData 摊回响应里发给访客
const RESERVED_DATA_KEYS = ['id', 'user_id', 'userid', 'deposit', 'created_at', 'createdat', 'status', 'custom_fields'];

// 逐个值清洗，而不是清洗完固定几项后再 ...userData.data 覆盖回去。
// createUser 旧写法正是后者：sanitizeString 白算一遍，客户端多传一个同名键就把它整个顶掉
const MAX_DATA_FIELD_LEN = 2000;

function sanitizeDataObject(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    if (RESERVED_DATA_KEYS.includes(String(key).toLowerCase())) continue;
    if (typeof value === 'string') {
      out[key] = sanitizeString(value).slice(0, MAX_DATA_FIELD_LEN);
    } else if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else {
      // 数组/对象一律转成字符串再洗一遍：资料列全是 text，
      // 直接把对象交给 pg 会被序列化成 PG 数组字面量（{a,b}）存进库里显示成乱码
      out[key] = sanitizeString(String(value)).slice(0, MAX_DATA_FIELD_LEN);
    }
  }
  return out;
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

async function getUserList(page = 1, limit = 20, isAdmin = false) {
  const users = await userDb.getAllUsers(page, limit, !isAdmin);
  return isAdmin ? users : maskUsers(users);
}

// 圈子页按标签在前端分组，需要一次拿全成员：走 /api/users 逐页翻（非管理员被夹到 20/50）
// 会打出几十次请求。触顶不静默截断——调用方用 total（同判据计数）与 data 条数对表即可发现
const CIRCLE_MEMBER_LIMIT = 2000;

async function getCircleMembers() {
  const users = await userDb.getAllUsers(1, CIRCLE_MEMBER_LIMIT, true);
  return maskUsers(users);
}

async function getUserStats() {
  return await userDb.getUserStats();
}

async function countUsers(onlyCertified = false) {
  return await userDb.countUsers(onlyCertified);
}

async function getPendingUsers() {
  return await userDb.getPendingUsers();
}

// ========== 用户详情（按权限返回不同内容） ==========

async function getMyUser(userId) {
  if (!userId) return null;
  const users = await userDb.getUsersByUserId(userId);
  if (users.length === 0) return null;
  const user = users[0];
  user.custom_fields = await userDb.getUserCustomFields(userId);
  // users.deposit 只有后台代录会填，线上支付只写 deposits 表，所以展示以 deposits 表的 approved 金额为准
  const depositRow = await paymentsDb.getMyDeposit(userId);
  user.deposit = Number(depositRow && depositRow.status === 'approved' ? depositRow.amount : user.deposit) || 0;
  return user;
}

// ========== 用户创建 / 更新 ==========

async function createUser(userData, ownerUserId, isPrivileged = false) {
  const errors = validateUserData(userData);
  if (errors.length > 0) {
    return { success: false, message: errors.join(', ') };
  }
  // 认证费是发布的唯一门票：没缴过就写不进库，访客侧也就永远搜不到这条资料
  if (!isPrivileged) {
    const deposit = ownerUserId ? await paymentsDb.getMyDeposit(ownerUserId) : null;
    if (!deposit || deposit.status !== 'approved') {
      return { success: false, code: 'need_certification', message: '请先缴纳诚意认证费，资料才能发布并对外展示' };
    }
  }
  const newUser = {
    id: userData.id || 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    user_id: ownerUserId || null,
    deposit: isPrivileged ? (userData.deposit || 0) : 0,
    createdAt: Date.now(),
    data: sanitizeDataObject(userData.data)
    // status 不在这里写：审核状态只归 approve/reject 两个接口管，
    // 连「客户端传来的 status」也不采信——否则任何人 POST 一个 status:'approved' 就自审通过了
  };
  await userDb.addUser(newUser);
  return { success: true, user: newUser };
}

async function updateMyUser(userId, userData) {
  if (!userId) return { success: false, message: '未登录' };
  const existing = await userDb.getUsersByUserId(userId);
  if (existing.length === 0) {
    return await createUser(userData, userId);
  }
  const current = existing[0];
  const updated = {
    ...current,
    data: {
      ...current.data,
      ...sanitizeDataObject(userData.data)
    }
  };
  await userDb.updateUser(current.id, updated);
  return { success: true, user: updated };
}

async function editUserById(id, userData) {
  const existing = await userDb.getUserById(id);
  if (!existing) return { success: false, message: '用户不存在' };
  const updated = {
    ...existing,
    data: {
      ...existing.data,
      ...sanitizeDataObject(userData.data)
    }
  };
  // 顶层字段仍按管理员原意保留（改挂靠账号、代收认证费要走这里），但资料内容统一清洗过
  for (const key of ['user_id', 'deposit']) {
    if (userData[key] !== undefined) updated[key] = userData[key];
  }
  await userDb.updateUser(id, updated);
  return { success: true, user: updated };
}

// ========== 用户删除 ==========

async function removeUser(id, ownerUserId, isAdmin = false) {
  // 头像路径必须在删行之前取，删完就查不到了
  const target = await userDb.getUserById(id);
  const success = await userDb.deleteUser(id, ownerUserId, isAdmin);
  if (success && target) deleteUploadedFile(target.data && target.data.avatar);
  return { success, message: success ? '删除成功' : '无权限或用户不存在' };
}

async function removeMyUser(userId) {
  if (!userId) return { success: false, message: '未登录' };
  const users = await userDb.getUsersByUserId(userId);
  if (users.length === 0) return { success: false, message: '未找到关联用户' };
  const target = users[0];
  const success = await userDb.deleteUser(target.id, userId, false);
  if (success) deleteUploadedFile(target.data && target.data.avatar);
  // 以前这里无条件 return { success: true }：库里一行没删掉，接口照样回「已删除」，
  // 前端弹提示、人还挂在搜索结果里。回码跟着真实结果走
  return { success, message: success ? '已删除' : '删除失败' };
}

// ========== 审核 ==========

async function approveUser(id) {
  // 先确认这条资料还在：updateUser 对不存在的 id 是「0 行被改」而不是报错，
  // 不查就等于给一个已经不存在的 id 记一笔「已通过审核」的后台操作日志
  const existing = await userDb.getUserById(id);
  if (!existing) return { success: false, message: '用户不存在' };
  await userDb.approveUser(id);
  await adminDb.logAdminAction('approve_user', id, {});
  return { success: true, message: '已通过审核' };
}

async function rejectUser(id) {
  const existing = await userDb.getUserById(id);
  if (!existing) return { success: false, message: '用户不存在' };
  await userDb.rejectUser(id);
  await adminDb.logAdminAction('reject_user', id, {});
  return { success: true, message: '已拒绝' };
}

// ========== 搜索 ==========

async function searchUsers(criteria, page = 1, limit = 20, isAdmin = false) {
  const result = await userDb.searchUsers(criteria, page, limit, isAdmin);
  return {
    data: isAdmin ? result.data : maskUsers(result.data),
    count: result.count
  };
}

// ========== 批量保存 ==========

async function batchSave(users, isAdmin = false) {
  if (!isAdmin) return { success: false, message: '需要管理员权限' };
  if (!Array.isArray(users) || users.length === 0) {
    return { success: false, message: '数据为空' };
  }
  await userDb.batchSaveUsers(users);
  return { success: true, message: `已保存 ${users.length} 条` };
}

// ========== 管理员功能 ==========

async function getAdminLogs(limit = 50) {
  return await adminDb.getAdminLogs(limit);
}

module.exports = {
  // 认证
  authenticateUser,
  // 查询
  getUserList,
  getCircleMembers,
  getMyUser,
  getUserStats,
  countUsers,
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
  maskUsers,
  maskContact,
  sanitizeString,
  validateIdFormat
};
