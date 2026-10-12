// ============================================================
// API 路由层 - 认证（只做 HTTP 解析 + 调用 Service + 返回 JSON）
// ============================================================

const authService = require('../services/auth.service');
const adminService = require('../services/admin.service');
const captchaService = require('../services/captcha.service');
const smsService = require('../services/sms.service');
const { generateAdminToken } = require('../db/index');
const { setAuthCookie, clearAuthCookie } = require('../utils/cookie工具');

// 统一 JSON 响应工具（从 utils 抽取，避免 9 个 route 文件重复定义）
const { sendJson } = require('../utils/sendJson');
const { clientIp: getClientIp } = require('../utils/clientIp');

// ========== POST /api/auth/register
function register(req, res, readBodyWithLimit, checkRegisterRateLimit, clientIp) {
  if (!checkRegisterRateLimit(clientIp)) {
    sendJson(res, 429, { success: false, message: '注册过于频繁，请稍后再试' });
    return;
  }
  return readBodyWithLimit(req).then(async body => {
    try {
      const data = JSON.parse(body);
      // 两个键各管一件事：IP 那一道只挡明显的脚本洪水（宽口径，默认额度见 server.js），
      // 因为移动网络的出口 IP 被整片用户共享，按 IP 收紧会连带锁死无关访客；
      // 真正能精准指向滥用的是手机号本身，所以按 phone 再限一道，防止有人拿一个出口批量注册。
      if (data.phone && !checkRegisterRateLimit('phone:' + data.phone, 10, 3600000)) {
        sendJson(res, 429, { success: false, message: '该手机号注册过于频繁，请1小时后再试' });
        return;
      }
      // 滑动验证：后端这套（/api/auth/captcha 与 checkCaptchaToken）已修好且按一次性令牌销毁，
      // 但注册页现在压根没接这条流程——现量：app/src 里除一处敏感词正则，没有任何组件请求过 /auth/captcha。
      // 这里贸然放开判据会把注册全站死（没人交得出 captchaToken），所以维持跳过，
      // 等注册页接上滑块再把下面这段解注释；这是产品决定，不是漏改
      // if (!captchaService.checkCaptchaToken(data.captchaId, data.captchaToken)) {
      //   sendJson(res, 400, { success: false, message: '滑动验证无效或已过期，请重新验证' });
      //   return;
      // }
      const result = await authService.register(data.phone, data.password, data.nickname);
      if (result.success) setAuthCookie(res, result.token);
      sendJson(res, result.success ? 200 : 400, result);
    } catch (e) {
      console.error('[register error]', e.message || e);
      // 兼容 PostgreSQL (duplicate key) 和 SQLite (UNIQUE constraint) 的唯一约束冲突错误
      if (e.code === '23505' || (e.message && (e.message.includes('duplicate key') || e.message.includes('UNIQUE constraint failed')))) {
        sendJson(res, 400, { success: false, message: '该手机号已注册' });
      } else {
        sendJson(res, 500, { success: false, message: '注册失败' });
      }
    }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== POST /api/auth/login
function login(req, res, readBodyWithLimit, checkLoginRateLimit) {
  const clientIp = getClientIp(req);
  if (!checkLoginRateLimit(clientIp)) {
    sendJson(res, 429, { success: false, message: '登录尝试过多，请5分钟后再试' });
    return;
  }
  return readBodyWithLimit(req).then(async body => {
    try {
      const data = JSON.parse(body);
      const result = await authService.login(data.phone, data.password);
      if (result.success) setAuthCookie(res, result.token);
      sendJson(res, result.success ? 200 : 401, result);
    } catch (e) {
      sendJson(res, 400, { success: false, message: '登录失败' });
    }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== POST /api/auth/logout
// 只清 httpOnly cookie。token 本身是无状态 HMAC，服务端没有会话表可以撤，
// 所以「退出后这枚 token 还能用」是这套方案的固有限制，不是这里漏写的一步：
// 前端同步清掉 localStorage 里的 auth_token，浏览器端就再也拿不出它；
// 真正泄露出去的 token 要撤回，得等引入服务端黑名单/短有效期那天。
// 不需要登录态也能调：登录态已过期的用户点退出同样应该把 cookie 清掉
function logout(req, res) {
  clearAuthCookie(res);
  sendJson(res, 200, { success: true, message: '已退出登录' });
}

// ========== POST /api/auth/change-password
async function changePassword(req, res, readBodyWithLimit) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendJson(res, 401, { success: false, message: '未登录' });
    return;
  }
  const token = authHeader.slice(7);
  const userId = (await authService.getCurrentUser(token))?.id;
  if (!userId) {
    sendJson(res, 401, { success: false, message: 'token无效' });
    return;
  }
  return readBodyWithLimit(req).then(async body => {
    try {
      const data = JSON.parse(body);
      const result = await authService.changePassword(userId, data.oldPassword, data.newPassword);
      sendJson(res, result.success ? 200 : 400, result);
    } catch (e) {
      sendJson(res, 500, { success: false, message: '修改密码失败' });
    }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== POST /api/auth/sms/register-code（预留：发送注册短信验证码）
function sendRegisterSmsCode(req, res, readBodyWithLimit) {
  return readBodyWithLimit(req).then(body => {
    try {
      const data = JSON.parse(body);
      const result = smsService.sendRegisterCode(data.phone);
      sendJson(res, result.success ? 200 : 400, result);
    } catch (e) {
      sendJson(res, 500, { success: false, message: '发送验证码失败' });
    }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== POST /api/auth/sms/verify-register-code（预留：校验注册短信验证码）
function verifyRegisterSmsCode(req, res, readBodyWithLimit) {
  return readBodyWithLimit(req).then(body => {
    try {
      const data = JSON.parse(body);
      const result = smsService.verifyRegisterCode(data.phone, data.code);
      sendJson(res, result.success ? 200 : 400, result);
    } catch (e) {
      sendJson(res, 500, { success: false, message: '校验验证码失败' });
    }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== POST /api/admin/login
function adminLogin(req, res, readBodyWithLimit, checkLoginRateLimit) {
  const clientIp = getClientIp(req);
  if (!checkLoginRateLimit(clientIp)) {
    sendJson(res, 429, { success: false, message: '登录尝试过多，请5分钟后再试' });
    return;
  }
  return readBodyWithLimit(req).then(async body => {
    try {
      const data = JSON.parse(body);
      // 兼容旧版仅传 password 的调用：未传 username 时使用默认管理员账号
      const username = data.username || process.env.ADMIN_USERNAME || 'admin';
      const password = data.password;
      const result = await adminService.verifyAdminAccount(username, password);
      if (result.success) {
        const token = generateAdminToken(result.username);
        sendJson(res, 200, { success: true, token, username: result.username });
      } else {
        sendJson(res, 401, { success: false, message: result.message || '管理员账号或密码错误' });
      }
    } catch (e) {
      console.error('[adminLogin error]', e.message || e);
      sendJson(res, 400, { success: false, message: '登录失败' });
    }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== GET /api/auth/captcha
function getCaptcha(req, res) {
  try {
    const captcha = captchaService.createCaptcha();
    sendJson(res, 200, { success: true, data: captcha });
  } catch (e) {
    sendJson(res, 500, { success: false, message: '验证码生成失败' });
  }
}

// ========== POST /api/auth/captcha/verify
function verifyCaptcha(req, res, readBodyWithLimit) {
  return readBodyWithLimit(req).then(body => {
    try {
      const data = JSON.parse(body);
      const result = captchaService.verifyCaptcha(data.captchaId, data.x);
      sendJson(res, 200, { success: result.success, data: result.success ? { token: result.token } : null, message: result.message });
    } catch (e) {
      sendJson(res, 500, { success: false, message: '验证失败' });
    }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

module.exports = { register, login, logout, changePassword, adminLogin, sendRegisterSmsCode, verifyRegisterSmsCode, getCaptcha, verifyCaptcha };
