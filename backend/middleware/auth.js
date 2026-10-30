// ============================================================
// 中间件 - 身份识别（Cookie 桥接 + Bearer 解析）
//
// 这套站的登录态有两处来源：浏览器走 httpOnly cookie（防 XSS 从 localStorage 偷），
// 脚本与后台页面走 Authorization: Bearer。桥接只做一件事——把 cookie 里的 token
// 补成 Bearer 头，让下游所有 handler 只认一种写法。
//
// ⚠ 顺序上的既成事实，原样保留：桥接在鉴权之前，所以只认 Bearer 的管理员判据
//   （admin-auth.js）拿到的是"用户 token"，isAdminToken 必然回 false，
//   不存在拿用户 cookie 蒙过管理员闸这条路。管理员登录接口本身不发 cookie，
//   所以正常流程里也不会有管理员令牌躺在 cookie 里。
// ============================================================

const { verifyToken } = require('../db/index');
const adminService = require('../services/admin.service');
const { getAuthTokenFromCookie } = require('../utils/cookie工具');

/**
 * Cookie → Authorization 桥接：让所有路由自动支持 httpOnly cookie 认证。
 * 只在请求本来没有 Authorization 头时才动手，显式带的 Bearer 永远优先。
 */
function cookieAuthBridge(req, res, next) {
  if (!req.headers.authorization) {
    const cookieToken = getAuthTokenFromCookie(req);
    if (cookieToken) req.headers.authorization = 'Bearer ' + cookieToken;
  }
  next();
}

/** 取 Bearer 后面的那串令牌；没有 Bearer 写法就回 null */
function bearerToken(req) {
  const header = req.headers.authorization;
  return header && header.startsWith('Bearer ') ? header.slice(7) : null;
}

/**
 * 解析出 { token, userId, isAdmin }。
 * 管理员令牌不映射到某个 userId（后台不属于任何一条资料），所以 isAdmin 时 userId 为 null。
 */
async function resolveAuth(req) {
  const token = bearerToken(req);
  if (!token) return { token: null, userId: null, isAdmin: false };
  const isAdmin = await adminService.isAdminToken(token);
  return { token, userId: isAdmin ? null : verifyToken(token), isAdmin };
}

/**
 * 必须带有效令牌才能往下走。
 * 两个提示语分开是有原因的：「没带」和「带了但对不上」是两种排查方向。
 *
 * allowAdmin 这个开关不是装饰：头像上传本来就允许后台调用（旧写法先 isAdminToken
 * 再 verifyToken，两把都认），而存款凭证、支付下单这些入口旧写法只认用户 token
 * ——管理员令牌照样回「token无效」。默认只认用户 token，要放开的那条自己写明。
 * @param {{missing?: string, invalid?: string, allowAdmin?: boolean}} options
 */
function requireToken(options = {}) {
  const missing = options.missing || '未登录';
  const invalid = options.invalid || 'token无效';
  const allowAdmin = options.allowAdmin === true;
  return async function requireTokenMiddleware(req, res, next) {
    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({ success: false, message: missing });
      return;
    }
    const isAdmin = allowAdmin ? await adminService.isAdminToken(token) : false;
    if (isAdmin) {
      req.auth = { token, isAdmin: true, userId: null };
      next();
      return;
    }
    const userId = verifyToken(token);
    if (!userId) {
      res.status(401).json({ success: false, message: invalid });
      return;
    }
    req.auth = { token, isAdmin: false, userId };
    next();
  };
}

/**
 * 只要求"带来了 Bearer"，不校验令牌本身。
 * 评价、举报、解锁申请这几条接口旧写法就是把 token 原样交给 service 去解
 * （ratings.service / reports.service 内部各有一套判据），
 * 在这里提前 verifyToken 会把「过期令牌回 400 + service 那句话」改成「401 + 本站这句」，
 * 前端展示的提示语就跟着变了。要保住契约，这道闸就只能判"有没有带"。
 * @param {{message?: string}} options
 */
function requireBearer(options = {}) {
  const message = options.message || '未登录';
  return function requireBearerMiddleware(req, res, next) {
    if (!bearerToken(req)) {
      res.status(401).json({ success: false, message });
      return;
    }
    next();
  };
}

module.exports = { cookieAuthBridge, bearerToken, resolveAuth, requireToken, requireBearer };
