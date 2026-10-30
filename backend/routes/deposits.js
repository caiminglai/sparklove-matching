// ============================================================
// 路由 - 认证费缴纳记录（后台审核 + 本人查询）
//
// 从旧的 routes/upload.js 里拆出来的：那个文件同时管"往盘上写图"和"管库里的缴费记录"，
// 上传那条已经归到 routes/upload.js，这里只留记录侧。
// 路径与判据一条没动，包括两个不显眼的地方：
//   1) 请求体超限在这里回 400（旧写法的 .catch 用的是 400，不是别处的 413）；
//   2) 路径里的 :id 限定成纯数字——旧 server.js 用 /\d+/ 预筛，
//      写成 :id 会让 /api/admin/deposits/abc/approve 从 404 变成 400。
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const paymentsDb = require('../db/payments.js');
const adminDb = require('../db/admin.js');
const dbIndex = require('../db/index.js');
const { deleteUploadedFile } = require('../utils/uploadedFiles');

const { requireToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin-auth');
const { asyncHandler } = require('../middleware/async-handler');
const { bodyLimit } = require('../middleware/body');
const { MAX_BODY_SIZE } = require('../config');

const router = express.Router({ strict: true }); // strict：尾斜杠不当同一条，理由见 routes/index.js 头部

const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', 'uploads');

// 旧写法：readBodyWithLimit 抛出来的那句「请求体过大，最大允许5MB」被 .catch 用 400 发了出去
const tooLarge400 = bodyLimit(MAX_BODY_SIZE, {
  status: 400,
  message: `请求体过大，最大允许${Math.round(MAX_BODY_SIZE / 1024 / 1024)}MB`,
});

// ========== GET /api/admin/deposits（后台缴费记录列表，可按状态筛）
router.get(
  '/api/admin/deposits',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const status = req.query.status || '';
    try {
      const records = await paymentsDb.getAllDeposits(status);
      res.status(200).json({ success: true, data: records });
    } catch (err) {
      res.status(500).json({ success: false, message: '服务器错误' });
    }
  }),
);

// ========== GET /api/users/my-deposit（本人看自己那条缴费记录）
router.get(
  '/api/users/my-deposit',
  requireToken(),
  asyncHandler(async (req, res) => {
    try {
      const record = await paymentsDb.getMyDeposit(req.auth.userId);
      res.status(200).json({ success: true, data: record || null });
    } catch (err) {
      res.status(500).json({ success: false, message: '服务器错误' });
    }
  }),
);

// ========== GET /api/admin/deposits/proof/:id（后台按记录 id 取那条记录，含凭证路径）
router.get(
  '/api/admin/deposits/proof/:id(\\d+)',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id || isNaN(id)) {
      res.status(400).json({ success: false, message: '无效的 ID' });
      return;
    }
    try {
      const database = dbIndex.getDb();
      const record = await database.prepare('SELECT * FROM deposits WHERE id = $1').get(id);
      if (!record) {
        res.status(404).json({ success: false, message: '记录不存在' });
        return;
      }
      // 老数据里有存成不带扩展名的路径，去目录里按前缀找回那张图
      if (record.proof_path && !/\.[a-zA-Z0-9]+$/.test(record.proof_path)) {
        const depositsDir = path.join(UPLOADS_ROOT, 'deposits');
        const baseName = String(record.proof_path).replace(/^.*\//, '');
        if (fs.existsSync(depositsDir)) {
          const files = fs.readdirSync(depositsDir).filter((f) => f.includes(baseName));
          if (files.length > 0) {
            record.proof_path = '/uploads/deposits/' + files[0];
          }
        }
      }
      res.status(200).json({ success: true, data: record });
    } catch (err) {
      res.status(500).json({ success: false, message: '服务器错误' });
    }
  }),
);

// ========== PUT /api/admin/deposits/:id/approve（认证费收讫）
router.put(
  '/api/admin/deposits/:id(\\d+)/approve',
  requireAdmin(),
  tooLarge400,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    try {
      const data = JSON.parse(req.body || '{}');
      const adminNote = data.admin_note || '审核通过';
      const success = await paymentsDb.updateDepositStatus(id, 'approved', adminNote);
      if (success) {
        // 和资料审核、解锁审核对齐：动库就留痕。原来只有这两条审核路径不打日志，
        // 后台「操作日志」里能看到通过/驳回了一个人的资料，却看不到收没收到认证费
        await adminDb.logAdminAction('approve_deposit', String(id), { note: adminNote });
        res.status(200).json({ success: true, message: '审核通过' });
      } else {
        res.status(404).json({ success: false, message: '该缴费记录不存在或已被删除，未做改动' });
      }
    } catch (err) {
      res.status(500).json({ success: false, message: '操作失败' });
    }
  }),
);

// ========== PUT /api/admin/deposits/:id/reject（驳回认证费）
router.put(
  '/api/admin/deposits/:id(\\d+)/reject',
  requireAdmin(),
  tooLarge400,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    try {
      const data = JSON.parse(req.body || '{}');
      const adminNote = data.admin_note || '审核未通过';
      const success = await paymentsDb.updateDepositStatus(id, 'rejected', adminNote);
      if (success) {
        await adminDb.logAdminAction('reject_deposit', String(id), { note: adminNote });
        res.status(200).json({ success: true, message: '已拒绝' });
      } else {
        res.status(404).json({ success: false, message: '该缴费记录不存在或已被删除，未做改动' });
      }
    } catch (err) {
      res.status(500).json({ success: false, message: '操作失败' });
    }
  }),
);

// ========== DELETE /api/admin/deposits/:id（删记录，连带把盘上那张截图删掉）
router.delete(
  '/api/admin/deposits/:id(\\d+)',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id || isNaN(id)) {
      res.status(400).json({ success: false, message: '无效的 ID' });
      return;
    }
    try {
      const database = dbIndex.getDb();
      const record = await database.prepare('SELECT * FROM deposits WHERE id = $1').get(id);
      if (!record) {
        res.status(404).json({ success: false, message: '记录不存在' });
        return;
      }
      const result = await database.prepare('DELETE FROM deposits WHERE id = $1').run(id);
      if (result.changes > 0) {
        // 记录删了就必须把盘上那张付款截图一起删掉：/uploads/* 匿名可下
        deleteUploadedFile(record.proof_path);
        res.status(200).json({ success: true, message: '删除成功' });
      } else {
        res.status(500).json({ success: false, message: '删除失败' });
      }
    } catch (err) {
      res.status(500).json({ success: false, message: '服务器错误' });
    }
  }),
);

module.exports = router;
