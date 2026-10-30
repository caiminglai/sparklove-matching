// ============================================================
// 路由 - 向量搜索（生成 / 相似 / 双向匹配 / 统计 / 批量）
//
// 旧写法不是 router，而是一个 handleVectorRequest(req, res, checkAdminAuth)：
// 每条请求都先过它一次，路径不是 /api/vector/ 开头就回 false 让 server.js 接着匹配。
// 换成 router 时把"回 false"这件事拆成了两半，两半都得照着旧行为来：
//   1) 登录判据挂在路径上，判据仍是 startsWith('/api/vector/')。
//      所以 /api/vector（不带尾斜杠）压根不吃这道闸，和旧写法一样直接 404——
//      用 router.use('/api/vector', ...) 会让它变成 401，那是凭据语义的漂移。
//   2) 认了登录但没匹配到具体子路径的（/api/vector/foo），继续往下漏，最后 404。
//
// ⚠ 这里的 viewerId 来自 verifyToken，不是 isAdminToken。管理员令牌在这套 token
//   格式里也会被 verifyToken 解出来（解出来的"userId"其实是管理员用户名），
//   旧写法就是这个行为，批量生成向量靠它先过登录闸、再过管理员闸。别顺手改成 resolveAuth。
// ============================================================

const express = require('express');

const vectorService = require('../services/vector.service');
const { requireToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin-auth');
const { asyncHandler } = require('../middleware/async-handler');
const { bodyLimit } = require('../middleware/body');
const { searchParam } = require('../utils/searchParam');
const { MAX_VECTOR_BODY } = require('../config');

const router = express.Router({ strict: true }); // strict：尾斜杠不当同一条，理由见 routes/index.js 头部

// 所有向量 API 都需要登录：没带令牌和令牌不对都回同一句「请先登录」，
// 这是旧写法 requireAuth 的口径（两个分支合并成一句），不拆
const vectorAuth = requireToken({ missing: '请先登录', invalid: '请先登录' });
router.use((req, res, next) => {
  if (!req.path.startsWith('/api/vector/')) {
    next();
    return;
  }
  vectorAuth(req, res, next);
});

// GET /api/vector/stats - 获取向量统计
router.get(
  '/api/vector/stats',
  asyncHandler(async (req, res) => {
    try {
      const stats = await vectorService.getStats();
      res.status(200).json({ success: true, data: stats });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }),
);

// POST /api/vector/generate/:userId - 生成用户向量（仅本人）
router.post(
  '/api/vector/generate/:userId',
  asyncHandler(async (req, res) => {
    const viewerId = req.auth.userId;
    const userId = req.params.userId;
    if (String(viewerId) !== String(userId)) {
      res.status(403).json({ success: false, message: '只能为自己生成向量' });
      return;
    }
    try {
      const result = await vectorService.generateAndStoreUserVector(userId);
      res.status(200).json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }),
);

// GET /api/vector/similar/:userId - 查找相似用户（仅本人）
router.get(
  '/api/vector/similar/:userId',
  asyncHandler(async (req, res) => {
    const viewerId = req.auth.userId;
    const userId = req.params.userId;
    if (String(viewerId) !== String(userId)) {
      res.status(403).json({ success: false, message: '只能查看自己的匹配' });
      return;
    }
    const type = searchParam(req, 'type') || 'profile';
    const limit = parseInt(searchParam(req, 'limit')) || 10;
    try {
      const results = await vectorService.findSimilarUsers(userId, type, limit);
      res.status(200).json({ success: true, data: results });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }),
);

// GET /api/vector/match/:userId - 双向匹配推荐（仅本人）
router.get(
  '/api/vector/match/:userId',
  asyncHandler(async (req, res) => {
    const viewerId = req.auth.userId;
    const userId = req.params.userId;
    if (String(viewerId) !== String(userId)) {
      res.status(403).json({ success: false, message: '只能查看自己的匹配' });
      return;
    }
    const limit = parseInt(searchParam(req, 'limit')) || 10;
    try {
      const results = await vectorService.findMutualMatches(userId, limit);
      res.status(200).json({ success: true, data: results });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }),
);

// POST /api/vector/batch - 批量生成向量（仅管理员：一次最多跑 limit 个用户的付费向量）
// 先过登录闸、再过管理员闸，两道话不一样：旧写法就是这样，运维看文案能分清卡在哪一道
// 请求体上限这里跟着旧写法回 500「请求体过大」，不是别处的 413
router.post(
  '/api/vector/batch',
  requireAdmin({ status: 403, message: '仅管理员可批量生成向量' }),
  bodyLimit(MAX_VECTOR_BODY, { status: 500, message: '请求体过大' }),
  asyncHandler(async (req, res) => {
    try {
      const { limit = 100 } = req.body ? JSON.parse(req.body) : {};
      const results = await vectorService.batchGenerateVectors(parseInt(limit));
      res.status(200).json({ success: true, data: results });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }),
);

module.exports = router;
