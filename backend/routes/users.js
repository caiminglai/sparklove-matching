// ============================================================
// 路由 - 用户资料（列表 / 新建 / 批量导入 / 我的资料 / 审核 / 搜索 / 圈子 / 后台统计）
//
// 职责不变：解析 URL 参数、请求体、权限检查、返回 JSON；
// 不直接操作数据库，业务逻辑一律走 services/user.service.js。
//
// ⚠ 路由注册顺序就是判据顺序，别顺手排字母序：
//   /api/users/my、/api/users/pending、/api/users/search 都必须早于 /api/users/:id，
//   否则 PUT/DELETE 会先被 :id 那条接住，把「我的资料」当成一个 id 去查管理员权限。
//   旧 server.js 里就是这个次序（L364-423），跨文件的 /api/users/custom-fields
//   由 routes/index.js 保证排在本文件之前。
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const userService = require('../services/user.service');
const { resolveAuth, requireToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin-auth');
const { asyncHandler } = require('../middleware/async-handler');
const { defaultBodyLimit } = require('../middleware/body');
const { editAvatarUpload, formFields, fileField } = require('../middleware/upload');
const { validateMagicBytes } = require('../utils/file-validation');
const userDb = require('../db/users.js');

const router = express.Router({ strict: true }); // strict：尾斜杠不当同一条，理由见 routes/index.js 头部

const AVATARS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'avatars');
const ALLOWED_AVATAR_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

// ========== GET /api/users（用户列表 + keyword 搜索）
router.get(
  '/api/users',
  asyncHandler(async (req, res) => {
    const authInfo = await resolveAuth(req);
    const isLoggedIn = !!(authInfo.userId || authInfo.isAdmin);

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    let limit = parseInt(req.query.limit) || 20;
    const keyword = req.query.keyword;
    const exact = req.query.exact;

    // 条数上限先算好，再进分支。以前这套夹取只写在 else 里，
    // 带 keyword 的搜索分支拿的是客户端原样传的 limit——?keyword=x&limit=100000 就能一次拖走全表
    if (authInfo.isAdmin) {
      limit = 10000;
    } else if (!isLoggedIn) {
      if (limit > 20) limit = 20;
    } else if (limit > 50) {
      limit = 50;
    } else if (limit < 1) {
      limit = 1;
    }

    let result, total;

    if (keyword) {
      const criteria = { keyword, exact };
      const searchResult = await userService.searchUsers(criteria, page, limit, authInfo.isAdmin);
      result = searchResult.data;
      total = searchResult.count;
    } else {
      result = await userService.getUserList(page, limit, authInfo.isAdmin);
      total = await userService.countUsers(!authInfo.isAdmin);
    }

    res.status(200).json({ success: true, data: result, total });
  }),
);

// ========== POST /api/users（创建用户）
router.post(
  '/api/users',
  defaultBodyLimit(),
  asyncHandler(async (req, res) => {
    try {
      const data = JSON.parse(req.body);
      const authInfo = await resolveAuth(req);

      if (authInfo.isAdmin) {
        const result = await userService.createUser(data, null, true);
        res.status(result.success ? 200 : 400).json(result);
        return;
      }
      if (authInfo.userId) {
        const result = await userService.createUser(data, authInfo.userId);
        if (result.success) {
          res.status(200).json(result);
        } else if (result.code === 'need_certification') {
          res.status(403).json(result);
        } else {
          res.status(400).json(result);
        }
        return;
      }
      res.status(401).json({ success: false, message: '需要登录' });
    } catch (e) {
      res.status(500).json({ success: false, message: '添加失败' });
    }
  }),
);

// ========== POST /api/users/batch（批量保存用户）
router.post(
  '/api/users/batch',
  requireAdmin(),
  defaultBodyLimit(),
  asyncHandler(async (req, res) => {
    try {
      const data = JSON.parse(req.body);
      if (!Array.isArray(data)) {
        res.status(400).json({ success: false, message: '数据格式错误' });
        return;
      }
      const result = await userService.batchSave(data, true);
      if (result.success) {
        res.status(200).json({ success: true, count: data.length });
      } else {
        res.status(400).json(result);
      }
    } catch (e) {
      res.status(500).json({ success: false, message: '批量保存失败' });
    }
  }),
);

// ========== GET /api/users/my（获取当前登录用户）
// 这一条管理员令牌也能过（getMyUser(null) 由 service 侧回 null），
// 所以不能套 requireToken——它的默认档只认用户 token，会把后台请求打成「token无效」
router.get(
  '/api/users/my',
  asyncHandler(async (req, res) => {
    const authInfo = await resolveAuth(req);
    if (!authInfo.token) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }
    if (!authInfo.userId && !authInfo.isAdmin) {
      res.status(401).json({ success: false, message: 'token无效' });
      return;
    }
    const user = await userService.getMyUser(authInfo.userId);
    res.status(200).json({ success: true, user });
  }),
);

// ========== PUT /api/users/my（更新当前用户）
router.put(
  '/api/users/my',
  requireToken(),
  defaultBodyLimit(),
  asyncHandler(async (req, res) => {
    try {
      const data = JSON.parse(req.body);
      const result = await userService.updateMyUser(req.auth.userId, data);
      if (result.success) {
        res.status(200).json(result);
      } else if (result.code === 'need_certification') {
        res.status(403).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (e) {
      res.status(500).json({ success: false, message: '更新失败' });
    }
  }),
);

// ========== DELETE /api/users/my（删除当前用户）
router.delete(
  '/api/users/my',
  requireToken(),
  asyncHandler(async (req, res) => {
    const result = await userService.removeMyUser(req.auth.userId);
    res.status(result.success ? 200 : 404).json(result);
  }),
);

// ========== GET /api/users/pending（待审核用户列表）
router.get(
  '/api/users/pending',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const users = await userService.getPendingUsers();
    res.status(200).json({ success: true, data: users });
  }),
);

// ========== GET /api/users/search（搜索用户）
router.get(
  '/api/users/search',
  asyncHandler(async (req, res) => {
    const authInfo = await resolveAuth(req);
    // 整个 query 对象摊平进 criteria：自定义字段的筛选条件就是靠这个进来的，
    // 所以这里的 query parser 必须是 querystring（simple）而不是 qs
    const criteria = { ...req.query };
    for (const [key, value] of Object.entries(criteria)) {
      if (typeof value === 'string') {
        criteria[key] = userService.sanitizeString(value);
      }
    }
    // 自定义字段：前端以 JSON 字符串传递，需解析为数组
    if (typeof criteria.custom_fields === 'string') {
      try {
        criteria.custom_fields = JSON.parse(criteria.custom_fields);
      } catch {
        criteria.custom_fields = [];
      }
    }
    const page = parseInt(criteria.page) || 1;
    const limit = Math.min(parseInt(criteria.limit) || 20, 100);
    const result = await userService.searchUsers(criteria, page, limit, authInfo.isAdmin);
    res.status(200).json({ success: true, ...result });
  }),
);

// ========== GET /api/circles/members（圈子页：一次返回全部成员的脱敏行）
// 与 /api/users 返回同样的行形状，圈子页才不必逐页翻；脱敏由 service 层统一走 maskUsers
router.get(
  '/api/circles/members',
  asyncHandler(async (req, res) => {
    try {
      const result = await userService.getCircleMembers();
      const total = await userService.countUsers(true);
      res.status(200).json({ success: true, data: result, total });
    } catch (err) {
      console.error('圈子成员查询失败:', err.message);
      res.status(500).json({ success: false, error: '服务器错误' });
    }
  }),
);

// ========== GET /api/admin/stats（后台首页那几格数字）
// 旧写法内联在 server.js（L353-361），因为它读的是 userDb，跟着用户路由搬到这里
router.get(
  '/api/admin/stats',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const stats = await userDb.getUserStats();
    res.status(200).json({ success: true, stats });
  }),
);

// ========== PUT /api/users/:id（管理员编辑用户，同时接 JSON 和 multipart）
// multipart 由 editAvatarUpload 收（multer），JSON 走全局 textBody；
// 两条路的请求体上限各自复检，措辞保持历史那一份
router.put(
  '/api/users/:id',
  requireAdmin(),
  editAvatarUpload,
  defaultBodyLimit(),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id || !userService.validateIdFormat(id)) {
      res.status(400).json({ success: false, message: '无效的用户ID' });
      return;
    }

    const avatarFile = fileField(req, 'avatar');
    if (avatarFile) {
      try {
        const fields = {};
        const body = formFields(req);
        if (body.name) fields.name = userService.sanitizeString(body.name).substring(0, 50);
        if (body.gender) fields.gender = userService.sanitizeString(body.gender).substring(0, 10);
        if (body.age) fields.age = userService.sanitizeString(body.age).substring(0, 10);
        if (body.city) fields.city = userService.sanitizeString(body.city).substring(0, 50);
        if (body.contact)
          fields.contact = userService.sanitizeString(body.contact).substring(0, 100);

        const ext = (avatarFile.originalname.split('.').pop() || 'jpg').toLowerCase();
        if (!ALLOWED_AVATAR_EXTS.includes(ext)) {
          res.status(400).json({ success: false, message: '不支持的文件格式' });
          return;
        }
        // 魔术数字校验：防止伪造扩展名的恶意文件
        if (!validateMagicBytes(avatarFile.buffer, '.' + ext)) {
          res.status(400).json({ success: false, message: '文件内容与扩展名不匹配' });
          return;
        }
        // 历史这里还有一条「文件过大，最大支持5MB」400：单文件已经超 5MB 时，
        // 整条请求体必然更早超，multer 会先回 413「请求体过大」——那一句在这里永远走不到，
        // 搬过来时不再保留（口径与 middleware/upload.js 的 editAvatarUpload 一致）
        fs.mkdirSync(AVATARS_DIR, { recursive: true });
        const avatarName = `${id}.${ext}`;
        fs.writeFileSync(path.join(AVATARS_DIR, avatarName), avatarFile.buffer);
        fields.avatar = `/uploads/avatars/${avatarName}`;

        const result = await userService.editUserById(id, { data: fields });
        // 按业务结果回码：以前无论成功失败都回 200，后台拿到 200 也判不出「这人根本不存在」
        res.status(result.success ? 200 : 404).json(result);
      } catch (e) {
        res.status(500).json({ success: false, message: '编辑失败: ' + e.message });
      }
      return;
    }

    try {
      const data = JSON.parse(req.body);
      const result = await userService.editUserById(id, data);
      res.status(result.success ? 200 : 404).json(result);
    } catch (e) {
      res.status(500).json({ success: false, message: '编辑失败' });
    }
  }),
);

// ========== DELETE /api/users/:id（删除用户）
// 本人和后台都能删：删的是「这条资料」，service 里再判这一条归不归你
router.delete(
  '/api/users/:id',
  asyncHandler(async (req, res) => {
    const authInfo = await resolveAuth(req);
    const id = req.params.id;
    if (!id || !userService.validateIdFormat(id)) {
      res.status(400).json({ success: false, message: '无效的用户ID' });
      return;
    }
    // 必须登录
    if (!authInfo.userId && !authInfo.isAdmin) {
      res.status(401).json({ success: false, message: '需要登录' });
      return;
    }
    const result = await userService.removeUser(id, authInfo.userId, authInfo.isAdmin);
    res.status(result.success ? 200 : 403).json(result);
  }),
);

// ========== POST /api/users/:id/approve（通过审核）
router.post(
  '/api/users/:id/approve',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id || !userService.validateIdFormat(id)) {
      res.status(400).json({ success: false, message: '无效的用户ID' });
      return;
    }
    const result = await userService.approveUser(id);
    res.status(result.success ? 200 : 404).json(result);
  }),
);

// ========== POST /api/users/:id/reject（拒绝审核）
router.post(
  '/api/users/:id/reject',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id || !userService.validateIdFormat(id)) {
      res.status(400).json({ success: false, message: '无效的用户ID' });
      return;
    }
    const result = await userService.rejectUser(id);
    res.status(result.success ? 200 : 404).json(result);
  }),
);

module.exports = router;
