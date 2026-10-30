// ============================================================
// 路由 - 举报（提交 / 后台列表 / 后台改状态 / 后台删除）
//
// 三处改造时最容易被"顺手规范掉"的既有口径，原样保留：
//   1) 提交这一条不在这里校验令牌内容，只判"有没有带 Bearer"。
//      旧写法把 token 原样交给 reports.service 去解，「令牌过期」回的是 service
//      那句 400，不是本站的 401。改成 requireToken 会让前端提示语整个变掉。
//   2) 两条分支的请求体超限回的都是 500「读取请求体失败」，不是 413。
//      这是各自 .catch 里写死的话，跟其它接口的 413「请求体过大」不是一族。
//   3) 后台列表这条把 service 的返回值**直接**当响应体发出去，外面没有
//      {success, data} 那层壳。前端按数组/对象原样在读，加壳就是改契约。
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const reportsService = require('../services/reports.service');
const { validateMagicBytes, validateExtension } = require('../utils/file-validation');
const { buildUploadName, deleteUploadedFile } = require('../utils/uploadedFiles');
const { searchParam } = require('../utils/searchParam');

const { requireBearer, bearerToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin-auth');
const { asyncHandler } = require('../middleware/async-handler');
const { bodyLimit } = require('../middleware/body');
const { reportUpload, formFields } = require('../middleware/upload');
const { MAX_BODY_SIZE } = require('../config');

const router = express.Router({ strict: true }); // strict：尾斜杠不当同一条，理由见 routes/index.js 头部

const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'reports');

// 提交接口的 JSON 分支：超限那句是固定话术，不带"最大允许 xMB"
const tooLarge500 = bodyLimit(MAX_BODY_SIZE, { status: 500, message: '读取请求体失败' });

// ========== POST /api/reports（JSON 与 multipart 两种都收）
router.post(
  '/api/reports',
  requireBearer({ message: '未登录' }),
  reportUpload,
  tooLarge500,
  asyncHandler(async (req, res) => {
    const token = bearerToken(req);
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    // multipart 表单
    if (req.files) {
      try {
        const fields = formFields(req);
        const reportedId = fields.reportedId || null;
        const reportType = fields.reportType || null;
        const description = fields.description || null;

        // 处理文件：先把要落盘的那一张选出来、验完再写。
        // 旧写法在 for 里边验边写，多条文件时只有最后一张的 path 进得了库，
        // 前面几张成了盘上没人认领的孤儿图（reports 目录是匿名可下载的）
        let pendingFile = null;
        for (const file of Array.isArray(req.files) ? req.files : []) {
          const { valid, ext } = validateExtension(file.originalname);
          if (!valid) continue;
          // 魔术数字校验
          if (!validateMagicBytes(file.buffer, ext)) {
            res.status(400).json({ success: false, message: '文件内容与扩展名不匹配' });
            return;
          }
          if (!pendingFile) pendingFile = { ext, data: file.buffer };
        }

        let proofPath = null;
        if (pendingFile) {
          const fileName = buildUploadName('report', pendingFile.ext);
          fs.writeFileSync(path.join(UPLOADS_DIR, fileName), pendingFile.data);
          proofPath = '/uploads/reports/' + fileName;
        }

        const result = await reportsService.submitReport(
          token,
          reportedId,
          reportType,
          description,
          proofPath,
        );
        // service 还要判目标是否存在、能不能举报自己、类型合不合法。
        // 这些判不过时盘上那张图没人认领，必须当场清掉，不能留在匿名可下载目录里
        if (!result.success && proofPath) deleteUploadedFile(proofPath);
        res.status(result.success ? 200 : 400).json(result);
      } catch (e) {
        res.status(500).json({ success: false, message: '举报失败' });
      }
      return;
    }

    // JSON
    try {
      const data = JSON.parse(req.body || '{}');
      const result = await reportsService.submitReport(
        token,
        data.reportedId,
        data.reportType,
        data.description,
        null,
      );
      res.status(result.success ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ success: false, message: '举报失败' });
    }
  }),
);

// ========== GET /api/reports（后台列表，status 可选）
router.get(
  '/api/reports',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const status = searchParam(req, 'status');
    const reports = await reportsService.getAllReportsForAdmin(status || null);
    res.status(200).json(reports);
  }),
);

// ========== PUT /api/reports/:id/status
// （前端 main.html 与 m.html 请求的都是这个路径，不是 /api/admin/reports/:id；
//   旧 server.js 的预过滤是 /^\/api\/reports\/\d+\/status$/，id 非数字直接 404，
//   这里的 :id(\\d+) 约束就是那一条正则的等价写法）
router.put(
  '/api/reports/:id(\\d+)/status',
  requireAdmin(),
  bodyLimit(1024 * 1024, { status: 413, message: '请求体过大' }),
  asyncHandler(async (req, res) => {
    const reportId = parseInt(req.params.id);
    try {
      const data = JSON.parse(req.body || '{}');
      const result = await reportsService.updateStatus(reportId, data.status, data.adminNote);
      res.status(result.success ? 200 : result.notFound ? 404 : 400).json(result);
    } catch (e) {
      res.status(500).json({ success: false, message: '更新失败' });
    }
  }),
);

// ========== DELETE /api/reports/:id
router.delete(
  '/api/reports/:id(\\d+)',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const reportId = parseInt(req.params.id);
    try {
      const result = await reportsService.removeReport(reportId);
      res.status(result.success ? 200 : 404).json(result);
    } catch (e) {
      res.status(500).json({ success: false, message: '删除失败' });
    }
  }),
);

module.exports = router;
