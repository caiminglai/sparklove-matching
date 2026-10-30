// ============================================================
// 路由 - 评价（只做 HTTP 解析 + 调用 Service + 返回 JSON）
//
// ⚠ POST /api/ratings 这里不能换成 requireToken：旧写法只要求"带了 Bearer"，
//   令牌对不对是 ratings.service 自己判的（它拿同一枚 token 去查是谁评的）。
//   提前 verifyToken 会把「400 + service 那句话」变成「401 + 本站这句」，
//   前端弹的提示语跟着变——所以用的是 requireBearer。
// ============================================================

const express = require('express');

const ratingsService = require('../services/ratings.service');
const { bearerToken, requireBearer } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/async-handler');
const { defaultBodyLimit } = require('../middleware/body');

const router = express.Router({ strict: true }); // strict：尾斜杠不当同一条，理由见 routes/index.js 头部

// ========== POST /api/ratings
router.post(
  '/api/ratings',
  requireBearer(),
  defaultBodyLimit(),
  asyncHandler(async (req, res) => {
    const token = bearerToken(req);
    try {
      const data = JSON.parse(req.body);
      const result = await ratingsService.addRating(token, data.ratedId, data.rating, data.comment);
      res.status(result.success ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ success: false, message: '评价失败' });
    }
  }),
);

// ========== GET /api/users/:id/ratings
router.get(
  '/api/users/:id/ratings',
  asyncHandler(async (req, res) => {
    const result = await ratingsService.getUserRatings(req.params.id);
    res.status(200).json({ success: true, ratings: result.ratings, average: result.average });
  }),
);

module.exports = router;
