const vectorService = require('../services/vector.service');
const dbIndex = require('../db/index.js');
const { collectBody } = require('../utils/multipart');
const { MAX_VECTOR_BODY } = require('../utils/config');

/**
 * 验证用户身份，返回 userId 或 null
 */
function requireAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return dbIndex.verifyToken(authHeader.slice(7));
}

// 统一 JSON 响应工具（从 utils 抽取，避免 9 个 route 文件重复定义）
const { sendJson } = require('../utils/sendJson');

/**
 * 向量搜索API路由（原生HTTP）
 * 返回 true 表示已处理该请求，false 表示非向量路由，由 server.js 继续匹配
 */
async function handleVectorRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname;
  const method = req.method;

  // 关键修复：仅当路径以 /api/vector/ 开头时才视为向量路由
  // 否则返回 false 让 server.js 继续匹配其他路由（如公开的 /api/users）
  if (!pathname.startsWith('/api/vector/')) {
    return false;
  }

  // 所有向量 API 都需要登录
  const viewerId = requireAuth(req);
  if (!viewerId) {
    sendJson(res, 401, { success: false, message: '请先登录' });
    return true;
  }

  // GET /api/vector/stats - 获取向量统计
  if (method === 'GET' && pathname === '/api/vector/stats') {
    try {
      const stats = await vectorService.getStats();
      sendJson(res, 200, { success: true, data: stats });
    } catch (e) {
      sendJson(res, 500, { success: false, message: e.message });
    }
    return true;
  }

  // POST /api/vector/generate/:userId - 生成用户向量（仅本人）
  if (method === 'POST' && pathname.match(/^\/api\/vector\/generate\/([^/]+)$/)) {
    const userId = pathname.match(/^\/api\/vector\/generate\/([^/]+)$/)[1];
    if (String(viewerId) !== String(userId)) {
      sendJson(res, 403, { success: false, message: '只能为自己生成向量' });
      return true;
    }
    try {
      const result = await vectorService.generateAndStoreUserVector(userId);
      sendJson(res, 200, { success: true, data: result });
    } catch (e) {
      sendJson(res, 500, { success: false, message: e.message });
    }
    return true;
  }

  // GET /api/vector/similar/:userId - 查找相似用户（仅本人）
  if (method === 'GET' && pathname.match(/^\/api\/vector\/similar\/([^/]+)$/)) {
    const userId = pathname.match(/^\/api\/vector\/similar\/([^/]+)$/)[1];
    if (String(viewerId) !== String(userId)) {
      sendJson(res, 403, { success: false, message: '只能查看自己的匹配' });
      return true;
    }
    const type = url.searchParams.get('type') || 'profile';
    const limit = parseInt(url.searchParams.get('limit')) || 10;
    try {
      const results = await vectorService.findSimilarUsers(userId, type, limit);
      sendJson(res, 200, { success: true, data: results });
    } catch (e) {
      sendJson(res, 500, { success: false, message: e.message });
    }
    return true;
  }

  // GET /api/vector/match/:userId - 双向匹配推荐（仅本人）
  if (method === 'GET' && pathname.match(/^\/api\/vector\/match\/([^/]+)$/)) {
    const userId = pathname.match(/^\/api\/vector\/match\/([^/]+)$/)[1];
    if (String(viewerId) !== String(userId)) {
      sendJson(res, 403, { success: false, message: '只能查看自己的匹配' });
      return true;
    }
    const limit = parseInt(url.searchParams.get('limit')) || 10;
    try {
      const results = await vectorService.findMutualMatches(userId, limit);
      sendJson(res, 200, { success: true, data: results });
    } catch (e) {
      sendJson(res, 500, { success: false, message: e.message });
    }
    return true;
  }

  // POST /api/vector/batch - 批量生成向量（需要登录，防止匿名滥用）
  if (method === 'POST' && pathname === '/api/vector/batch') {
    try {
      const body = await collectBody(req, MAX_VECTOR_BODY);
      const { limit = 100 } = body ? JSON.parse(body) : {};
      const results = await vectorService.batchGenerateVectors(parseInt(limit));
      sendJson(res, 200, { success: true, data: results });
    } catch (e) {
      sendJson(res, 500, { success: false, message: e.message });
    }
    return true;
  }

  return false; // 未处理的路由
}

module.exports = { handleVectorRequest };
