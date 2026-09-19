// ============================================================
// 业务逻辑层 - 管理员服务（纯业务规则，无 SQL，无 HTTP）
// ============================================================

const adminDb = require('../db/admin');
const { verifyAdminToken } = require('../db/index');
const bcrypt = require('bcrypt');

// 统一默认管理员账号（兼容旧版单一密码）
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

// 环境变量优先；未配置时回落到数据库（异步）
async function getDefaultAdminPassword() {
  return process.env.ADMIN_PASSWORD || await adminDb.getAdminPassword();
}

async function getAdminWhitelist() {
  const whitelist = await adminDb.getAdminWhitelist();
  // 如果未配置任何白名单，默认将环境变量中的管理员账号加入白名单，避免锁死后台
  if (whitelist.length === 0) {
    return [DEFAULT_ADMIN_USERNAME];
  }
  return whitelist;
}

async function isAdminUsername(username) {
  if (!username) return false;
  const whitelist = await getAdminWhitelist();
  return whitelist.includes(username);
}

// 密码比较：兼容明文密码（旧数据）和 bcrypt 哈希（新数据），登录成功后自动升级
async function comparePassword(inputPassword, storedPassword) {
  if (!storedPassword) return false;
  // bcrypt 哈希以 $2a$ 或 $2b$ 开头
  if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$')) {
    return bcrypt.compareSync(inputPassword, storedPassword);
  }
  // 明文密码直接比较
  const match = (inputPassword === storedPassword);
  if (match) {
    // 自动升级为 bcrypt 哈希
    try {
      const hashed = bcrypt.hashSync(inputPassword, 10);
      await adminDb.setAdminPassword(hashed);
      console.log('[Admin] 密码已自动升级为 bcrypt 哈希');
    } catch (e) {
      console.warn('[Admin] 密码升级失败:', e.message);
    }
  }
  return match;
}

async function verifyAdminAccount(username, inputPassword) {
  if (!username || !inputPassword) {
    return { success: false, message: '请输入管理员账号和密码' };
  }
  const whitelist = await getAdminWhitelist();
  if (!whitelist.includes(username)) {
    return { success: false, message: '该账号无管理员权限' };
  }

  // 优先读取该账号独立密码；未设置则回退到默认管理员密码
  let expectedPassword = await adminDb.getAdminAccountPassword(username);
  let isAccountPassword = true;
  if (!expectedPassword) {
    expectedPassword = await getDefaultAdminPassword();
    isAccountPassword = false;
  }

  const match = await comparePassword(inputPassword, expectedPassword);
  if (!match) {
    return { success: false, message: '管理员账号或密码错误' };
  }
  return { success: true, username };
}

async function isAdminToken(token) {
  if (!token) return false;
  const username = verifyAdminToken(token);   // 同步 HMAC 校验，不用 await
  return !!username && await isAdminUsername(username);
}

module.exports = {
  verifyAdminAccount,
  isAdminToken
};
