// ============================================================
// 业务逻辑层 - 认证服务（纯业务规则，无 SQL，无 HTTP）
// ============================================================

const authDb = require('../db/auth');
const { generateToken, verifyToken, verifyPasswordSync } = require('../db/index');

async function register(phone, password, nickname) {
  if (!phone || !password) {
    return { success: false, message: '缺少手机号或密码' };
  }
  const userId = await authDb.createAuthUser(phone, password, nickname);
  const token = generateToken(userId);
  return { success: true, token, user: { id: userId, phone, nickname } };
}

async function login(phone, password) {
  const user = await authDb.verifyAuthUser(phone, password);
  if (!user) {
    return { success: false, message: '手机号或密码错误' };
  }
  const token = generateToken(user.id);
  return { success: true, token, user };
}

async function getCurrentUser(token) {
  if (!token) return null;
  const userId = verifyToken(token);
  if (!userId) return null;
  return await authDb.getAuthUserById(userId);
}

async function changePassword(userId, oldPassword, newPassword) {
  if (!userId || !oldPassword || !newPassword) {
    return { success: false, message: '参数不完整' };
  }
  if (newPassword.length < 6) {
    return { success: false, message: '新密码至少6位' };
  }
  const user = await authDb.getAuthUserByIdWithPassword(userId);
  if (!user) {
    return { success: false, message: '用户不存在' };
  }
  if (!verifyPasswordSync(oldPassword, user.password)) {
    return { success: false, message: '原密码错误' };
  }
  await authDb.updateAuthUserPassword(userId, newPassword);
  return { success: true, message: '密码修改成功' };
}

module.exports = {
  register,
  login,
  getCurrentUser,
  changePassword
};