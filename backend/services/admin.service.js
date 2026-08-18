// ============================================================
// 业务逻辑层 - 管理员服务（纯业务规则，无 SQL，无 HTTP）
// ============================================================

const adminDb = require('../db/admin');
const { verifyAdminToken } = require('../db/index');
const bcrypt = require('bcrypt');

// 统一默认管理员账号（兼容旧版单一密码）
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || adminDb.getAdminPassword();
if (!DEFAULT_ADMIN_PASSWORD) {
  console.error('[FATAL] ADMIN_PASSWORD not configured. Set it in .env or database.');
  process.exit(1);
}

function getAdminWhitelist() {
  const whitelist = adminDb.getAdminWhitelist();
  // 如果未配置任何白名单，默认将环境变量中的管理员账号加入白名单，避免锁死后台
  if (whitelist.length === 0) {
    return [DEFAULT_ADMIN_USERNAME];
  }
  return whitelist;
}

function isAdminUsername(username) {
  if (!username) return false;
  const whitelist = getAdminWhitelist();
  return whitelist.includes(username);
}

// 密码比较：兼容明文密码（旧数据）和 bcrypt 哈希（新数据），登录成功后自动升级
// 注意：必须用同步bcrypt，因为deasync DB层与async/await冲突会导致死锁
function comparePassword(inputPassword, storedPassword) {
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
      adminDb.setAdminPassword(hashed);
      console.log('[Admin] 密码已自动升级为 bcrypt 哈希');
    } catch (e) {
      console.warn('[Admin] 密码升级失败:', e.message);
    }
  }
  return match;
}

function verifyAdminAccount(username, inputPassword) {
  if (!username || !inputPassword) {
    return { success: false, message: '请输入管理员账号和密码' };
  }
  const whitelist = getAdminWhitelist();
  if (!whitelist.includes(username)) {
    return { success: false, message: '该账号无管理员权限' };
  }

  // 优先读取该账号独立密码；未设置则回退到默认管理员密码
  let expectedPassword = adminDb.getAdminAccountPassword(username);
  let isAccountPassword = true;
  if (!expectedPassword) {
    expectedPassword = DEFAULT_ADMIN_PASSWORD;
    isAccountPassword = false;
  }

  const match = comparePassword(inputPassword, expectedPassword);
  if (!match) {
    return { success: false, message: '管理员账号或密码错误' };
  }
  return { success: true, username };
}

function isAdminToken(token) {
  if (!token) return false;
  const username = verifyAdminToken(token);
  return !!username && isAdminUsername(username);
}

module.exports = {
  getAdminWhitelist,
  isAdminUsername,
  verifyAdminAccount,
  isAdminToken
};
