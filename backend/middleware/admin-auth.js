// ============================================================
// 中间件 - 管理员闸
//
// 判据只认 Authorization: Bearer，不认 cookie，这是防 CSRF 的一道：
// 后台那几个数据接口如果吃 cookie，任何第三方页面都能带着登录态的 cookie
// 发一条跨源请求替管理员改数据。
// 而浏览器地址栏直接跳 /admin/m 这类页面本来就没有 Bearer，所以那几条页面路由
// 一律不挂这道闸（旧 server.js 里为此专门写死过一条，理由见 routes/pages.js）。
// ============================================================

const adminService = require('../services/admin.service');
const { bearerToken } = require('./auth');

/** 只从 Bearer 头取管理员令牌；取不到回 null */
function getAdminToken(req) {
  return bearerToken(req);
}

async function isAdminRequest(req) {
  return await adminService.isAdminToken(getAdminToken(req));
}

/**
 * 管理员闸。默认回 401「需要管理员权限」——这是绝大多数后台入口的既有措辞。
 * 少数入口历史上回的是别的码和话（批量生成向量回 403），那些在这里点名，不改它们。
 * @param {{status?: number, message?: string}} options
 */
function requireAdmin(options = {}) {
  const status = options.status || 401;
  const message = options.message || '需要管理员权限';
  return async function requireAdminMiddleware(req, res, next) {
    if (!(await isAdminRequest(req))) {
      res.status(status).json({ success: false, message });
      return;
    }
    req.isAdmin = true;
    next();
  };
}

module.exports = { getAdminToken, isAdminRequest, requireAdmin };
