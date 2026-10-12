// ============================================================
// 业务逻辑层 - 管理员服务（纯业务规则，无 SQL，无 HTTP）
// ============================================================

const adminDb = require('../db/admin');
const { verifyAdminToken, constantTimeEqual } = require('../db/index');
const bcrypt = require('bcrypt');

// 统一默认管理员账号（兼容旧版单一密码）
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

// 环境变量优先；未配置时回落到数据库（异步）
// 现在这段规矩内联在 verifyAdminAccount 的三档凭据里，因为「读哪一档」必须和
// 「升级写回哪一档」绑在一起决定，拆成独立函数会被调用方漏掉档位。

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
// 升级要写回「哪一个键」由调用方通过 upgrade 传进来。旧写法在这里无条件调
// setAdminPassword(hashed)，也就是永远写全局 admin_password：
// 现量 admin_settings 只有 admin_password 一行是密码相关（bcrypt/60 字符），没有
// admin_whitelist、也没有任何 admin_password_<账号>。一旦有人按文档手工插入一个
// 明文子账号密码，子账号第一次登录就会把「子账号的密码哈希」盖进全局键——
// 子账号自己那份还是明文（永远升不了级），而默认管理员的密码被偷偷换成别人的。
// 现在环境变量 ADMIN_PASSWORD 设着（现量：容器里 SET，长度 14），getDefaultAdminPassword()
// 优先读环境变量、库里的哈希根本不会被读到，所以这条破坏暂时被遮住了；
// 一旦线上撤掉环境变量，库里那行就是唯一凭据，必须现在就修。
async function comparePassword(inputPassword, storedPassword, upgrade) {
  if (!storedPassword) return false;
  // 传进数字/对象时 bcrypt.compareSync 会抛异常，被路由层吞成「登录失败」，
  // 报错信息会让人以为是密码错——在这里挡掉，判据走同一条定长比较
  if (typeof inputPassword !== 'string') return false;
  // bcrypt 哈希以 $2a$ 或 $2b$ 开头
  if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$')) {
    return bcrypt.compareSync(inputPassword, storedPassword);
  }
  // 明文密码定长比较（=== 会因提前返回泄漏匹配前缀长度）
  const match = constantTimeEqual(inputPassword, storedPassword);
  if (match && typeof upgrade === 'function') {
    try {
      await upgrade(bcrypt.hashSync(inputPassword, 10));
      console.log('[Admin] 明文密码已自动升级为 bcrypt 哈希');
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

  // 凭据来源有三档，档位决定「升级该写回哪里」；
  // 落在环境变量那一档时不传 upgrade——环境变量永远压过库，写了下次也读不到，
  // 只会每次登录多一行 UPDATE 并把「已升级」的假象留在库里。
  const accountPassword = await adminDb.getAdminAccountPassword(username);
  let expectedPassword = accountPassword;
  let upgrade = null;
  if (accountPassword) {
    upgrade = (hashed) => adminDb.setSetting('admin_password_' + username, hashed);
  } else if (process.env.ADMIN_PASSWORD) {
    expectedPassword = process.env.ADMIN_PASSWORD;
  } else {
    expectedPassword = await adminDb.getAdminPassword();
    upgrade = (hashed) => adminDb.setAdminPassword(hashed);
  }

  const match = await comparePassword(inputPassword, expectedPassword, upgrade);
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
