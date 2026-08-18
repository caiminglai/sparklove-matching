// ============================================================
// API 路由层 - 评价（只做 HTTP 解析 + 调用 Service + 返回 JSON）
// ============================================================

const ratingsService = require('../services/ratings.service');

// 统一 JSON 响应工具（从 utils 抽取，避免 9 个 route 文件重复定义）
const { sendJson } = require('../utils/sendJson');

// ========== POST /api/ratings
function addRating(req, res, readBodyWithLimit) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendJson(res, 401, { success: false, message: '未登录' });
    return;
  }
  const token = authHeader.slice(7);
  return readBodyWithLimit(req).then(body => {
    try {
      const data = JSON.parse(body);
      const result = ratingsService.addRating(token, data.ratedId, data.rating, data.comment);
      sendJson(res, result.success ? 200 : 400, result);
    } catch (e) {
      sendJson(res, 500, { success: false, message: '评价失败' });
    }
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

// ========== GET /api/users/:id/ratings
function getRatings(req, res, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const id = parts[parts.indexOf('users') + 1];
  const result = ratingsService.getUserRatings(id);
  sendJson(res, 200, { success: true, ratings: result.ratings, average: result.average });
}

module.exports = { addRating, getRatings };
