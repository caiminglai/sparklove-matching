// ============================================================
// 路由 - 自定义字段（EAV 键值表 + 后台筛选字段定义 + 批量取字段）
//
// 这一族原来分在三个地方：routes/admin-custom-fields.js、routes/user-custom-fields.js，
// 以及内联在 server.js 的 /api/users/all-custom-fields（旧 L401-409）。
// 合成一个文件是因为它们的判据是缠在一起的——
// /api/users/custom-fields 这一族必须早于 PUT/DELETE /api/users/:id，
// 分开挂两个 router 就得靠 routes/index.js 里的挂载次序去记这条隐性依赖。
//
// ⚠ 两处历史口径容易被"顺手统一"掉，这里都保留了：
//   1) 本文件的请求体超限回 400（不是 413）。旧写法的 .catch 直接用了
//      sendJson(res, 400, {message: e.message})，和别的接口不一样，但前端没依赖状态码。
//   2) /api/users/custom-fields 对不支持的方法回 405「不支持的请求方法」，
//      而且这条判断在鉴权之后——没登录时先把 401 交出去。
// ============================================================

const express = require('express');

const adminDb = require('../db/admin.js');
const userDb = require('../db/users.js');
const dbIndex = require('../db/index.js');
const { verifyToken } = dbIndex;

const { bearerToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin-auth');
const { asyncHandler } = require('../middleware/async-handler');
const { bodyLimit } = require('../middleware/body');
const { writeLimiter } = require('../middleware/rate-limit');
const { MAX_BODY_SIZE } = require('../config');

const router = express.Router({ strict: true }); // strict：尾斜杠不当同一条，理由见 routes/index.js 头部

const TOO_LARGE_400 = bodyLimit(MAX_BODY_SIZE, {
  status: 400,
  message: `请求体过大，最大允许${Math.round(MAX_BODY_SIZE / 1024 / 1024)}MB`,
});

// ---------- GET /api/custom-fields（公开：前端渲染筛选器要用的字段定义）
router.get(
  '/api/custom-fields',
  asyncHandler(async (req, res) => {
    try {
      const fields = await adminDb.getAllCustomFilters();
      const parsed = fields.map((f) => ({
        ...f,
        options: f.field_options ? f.field_options.split(',').filter((o) => o.trim()) : [],
      }));
      res.status(200).json({ success: true, data: parsed });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }),
);

// ---------- POST /api/admin/custom-fields（后台新增一个筛选字段）
router.post(
  '/api/admin/custom-fields',
  requireAdmin(),
  TOO_LARGE_400,
  asyncHandler(async (req, res) => {
    try {
      const data = JSON.parse(req.body);
      if (!data.field_key || !data.field_label) {
        res.status(400).json({ success: false, message: '字段名和显示名必填' });
        return;
      }
      let fieldOptions = '';
      if (Array.isArray(data.field_options)) fieldOptions = data.field_options.join(',');
      else if (typeof data.field_options === 'string') fieldOptions = data.field_options;
      const field = await adminDb.addCustomFilter(
        data.field_key.trim(),
        data.field_label.trim(),
        data.field_type || 'text',
        data.description || '',
        fieldOptions,
      );
      res.status(200).json({ success: true, data: field });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }),
);

// ---------- DELETE /api/admin/custom-fields/:id（后台删掉一个筛选字段）
// 路径参数限定成纯数字：旧 server.js 的路由预过滤是 /\d+$/，
// 写成 :id 会把 /api/admin/custom-fields/abc 也从 404 变成 400，前端行为跟着变
router.delete(
  '/api/admin/custom-fields/:id(\\d+)',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) {
      res.status(400).json({ success: false, message: '无效的 ID' });
      return;
    }
    const deleted = await adminDb.deleteCustomFilter(id);
    res.status(200).json({ success: deleted, message: deleted ? '删除成功' : '未找到' });
  }),
);

// ---------- GET /api/users/all-custom-fields（资料卡批量取字段，按调用方给的 id 下发）
// 不做整表导出：user_ids 先过格式再截到 100 个，一次请求最多换 100 个人的字段
router.get(
  '/api/users/all-custom-fields',
  asyncHandler(async (req, res) => {
    const rawIds = String(req.query.user_ids || '');
    const userIds = [
      ...new Set(
        rawIds
          .split(',')
          .map((s) => s.trim())
          .filter((id) => /^[a-zA-Z0-9_-]{1,50}$/.test(id)),
      ),
    ].slice(0, 100);
    const allFields = await userDb.getCustomFieldsByUserIds(userIds);
    res.status(200).json({ success: true, data: allFields });
  }),
);

// ---------- /api/users/custom-fields 一族（本人读写自己的 EAV 行）
// 一个函数吃完所有方法，是因为旧写法就是"先鉴权 → 再按方法分支 → 都不命中回 405"。
// 拆成 router.get/post/delete 三条的话，PUT 这类不支持的方法会漏到 routes/users.js 的
// PUT /api/users/:id 上去，变成「要管理员权限」401——那是另一套答案。
async function userCustomFields(req, res) {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: '请先登录' });
    return;
  }
  const userId = verifyToken(token);
  if (!userId) {
    res.status(401).json({ success: false, message: 'token无效' });
    return;
  }

  if (req.method === 'GET' && req.path === '/api/users/custom-fields') {
    const fields = await userDb.getUserCustomFields(userId);
    res.status(200).json({ success: true, data: fields });
    return;
  }

  if (req.method === 'POST' && req.path === '/api/users/custom-fields') {
    if (Buffer.byteLength(req.body || '') > MAX_BODY_SIZE) {
      res.status(400).json({
        success: false,
        message: `请求体过大，最大允许${Math.round(MAX_BODY_SIZE / 1024 / 1024)}MB`,
      });
      return;
    }
    try {
      const data = JSON.parse(req.body);
      if (!data.field_key || data.field_value === undefined || data.field_value === null) {
        res.status(400).json({ success: false, message: '字段名和字段值必填' });
        return;
      }
      const result = await userDb.setUserCustomField(userId, data.field_key, data.field_value);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/users\/custom-fields\/[^/]+$/.test(req.path)) {
    const fieldKey = decodeURIComponent(req.path.split('/').pop());
    const deleted = await userDb.deleteUserCustomField(userId, fieldKey);
    res.status(200).json({ success: deleted, message: deleted ? '删除成功' : '未找到' });
    return;
  }

  // 不支持的 HTTP 方法返回 405，避免请求挂起
  res.status(405).json({ success: false, message: '不支持的请求方法' });
}

// 只闸写：GET 是资料页渲染要用的批量读，拦了会白屏（旧 server.js:397 就是这个判据），
// 那条豁免写在 writeLimiter 自己的 skip 里（middleware/rate-limit.js）。
// 限流排在鉴权之前——旧写法也是 server.js 里先过 checkRateLimit 才进 handler，
// 所以「没登录 + 已超限」那条请求历史回的是 429 不是 401，这里跟着不变。
router.all(
  ['/api/users/custom-fields', /^\/api\/users\/custom-fields\/[^/]+$/],
  writeLimiter,
  asyncHandler(userCustomFields),
);

module.exports = router;
