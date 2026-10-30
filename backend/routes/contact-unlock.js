// ============================================================
// 路由 - 联系方式解锁（用户提交凭证 / 后台审核 / 后台手动解锁 / 查是否已解锁）
//
// 判据一条没动，包括这几处容易在改造时被"顺手规范掉"的：
//   1) 提交凭证这一条只吃 multipart：请求体不是表单时，旧写法在取 boundary 那一步就回
//      400「无效的上传格式」。multer 的中间件对非表单请求是放行的，所以这条判据
//      在 handler 开头补了回来，不能少。
//   2) 三条审核/解锁接口的请求体超限回的不是同一口：审核 approve/reject 回 413，
//      后台手动解锁回 400（各自 .catch 里写死的），都按历史保留。
//   3) 「已解锁」的 SQL 必须带 ORDER BY (id = $1) DESC：一个账号名下有多条资料时
//      （现量：本机有账号挂 3 行），取到哪一行由数据库决定，不加排序就可能
//      把同账号里另一个人的号码发给解锁人。
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const dbIndex = require('../db/index.js');
const paymentsDb = require('../db/payments.js');
const adminDb = require('../db/admin.js');
const pricing = require('../utils/pricing');
const { validateMagicBytes, validateExtension } = require('../utils/file-validation');
const { buildUploadName, deleteUploadedFile } = require('../utils/uploadedFiles');

const { requireToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin-auth');
const { asyncHandler } = require('../middleware/async-handler');
const { bodyLimit, defaultBodyLimit, isMultipart } = require('../middleware/body');
const { unlockProofUpload, formFields } = require('../middleware/upload');
const { MAX_BODY_SIZE } = require('../config');

const router = express.Router({ strict: true }); // strict：尾斜杠不当同一条，理由见 routes/index.js 头部

const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'contact-unlock');

// 后台手动解锁：旧写法 .catch 用 400 发出去
const tooLarge400 = bodyLimit(MAX_BODY_SIZE, {
  status: 400,
  message: `请求体过大，最大允许${Math.round(MAX_BODY_SIZE / 1024 / 1024)}MB`,
});

// ========== POST /api/unlock-contact/submit（用户提交解锁凭证）
router.post(
  '/api/unlock-contact/submit',
  requireToken({ missing: '请先登录', invalid: '请先登录' }),
  unlockProofUpload,
  asyncHandler(async (req, res) => {
    const viewerId = req.auth.userId;

    // 只吃表单：非 multipart 时旧写法在 boundary 那步就回这一句
    if (!isMultipart(req)) {
      res.status(400).json({ success: false, message: '无效的上传格式' });
      return;
    }
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    try {
      const fields = formFields(req);
      const targetId = fields.target_user_id || null;
      const method = fields.method || 'manual';
      // 🔴 不读表单里的 amount：那是前端传来的数字，审核时看到的数额就能被提交方自己填

      // 已经解锁过的人不再收第二次凭证：重复提交会把 unlocked 那行覆写回 pending，
      // 而次数包余额正是按 unlocked 行数算的，覆写一次就等于白送回一次额度；
      // 顺带也不再往盘上多堆一张用不上的凭证图
      if (targetId && (await paymentsDb.checkContactUnlocked(viewerId, targetId))) {
        res.status(200).json({
          success: true,
          alreadyUnlocked: true,
          message: '你已解锁该联系方式，可直接查看',
        });
        return;
      }

      // 处理上传的文件：先把要落盘的那一张选出来、验完了再写。
      // 旧写法在 for 里边验边写，后面任何一步判不过（缺 targetId、缺凭证、多条文件）
      // 盘上都已经多了一张没人认领的图；多条文件时也只有最后一条的 path 进得了库，
      // 前面几张成了永远查不到主人的孤儿文件
      let pendingFile = null;
      for (const file of req.files || []) {
        const { valid, ext } = validateExtension(file.originalname);
        if (!valid) continue;
        // 魔术数字校验
        if (!validateMagicBytes(file.buffer, ext)) {
          res.status(400).json({ success: false, message: '文件内容与扩展名不匹配' });
          return;
        }
        if (!pendingFile) pendingFile = { ext, data: file.buffer };
      }

      if (!pendingFile || !targetId) {
        res.status(400).json({ success: false, message: '凭证和目标用户信息必填' });
        return;
      }

      // 目标得真存在：不然审核列表里会出现一条谁也点不开的记录，凭证图白占盘
      const database = dbIndex.getDb();
      const targetRow = await database
        .prepare('SELECT 1 AS hit FROM users WHERE id = $1 OR user_id = $2 LIMIT 1')
        .get(targetId, targetId);
      if (!targetRow) {
        res.status(400).json({ success: false, message: '要解锁的用户不存在' });
        return;
      }
      // 也不能是自己名下另一条资料：viewer_id 存的是账号 id，资料行 id 是另一个值，
      // 只比 viewerId === targetId 挡不住「拿自己另一条资料行当目标」
      const ownRow = await database
        .prepare(
          'SELECT 1 AS hit FROM users WHERE (id = $1 OR user_id = $1) AND user_id = $2 LIMIT 1',
        )
        .get(targetId, String(viewerId));
      if (ownRow) {
        res.status(400).json({ success: false, message: '这是你自己的资料，无需解锁' });
        return;
      }

      const fileName = buildUploadName(`contact_${viewerId}`, pendingFile.ext);
      fs.writeFileSync(path.join(UPLOADS_DIR, fileName), pendingFile.data);
      const proofPath = `/uploads/contact-unlock/${fileName}`;

      const amount = await pricing.getYuan('contactUnlock');
      const result = await paymentsDb.addContactUnlockRequest(
        String(viewerId),
        targetId,
        proofPath,
        method,
        amount,
      );
      if (result.success) {
        res
          .status(200)
          .json({ success: true, message: '凭证提交成功，等待管理员审核', proof_path: proofPath });
      } else {
        // 这条请求没进库（已解锁、或插入报错），盘上那张图就没有任何记录指向它。
        // contact-unlock 目录是匿名可下的，留一张孤图等于把一个真人姓名电话的截图挂在公网上
        deleteUploadedFile(proofPath);
        if (result.alreadyUnlocked) {
          // 并发下两条提交可能同时越过上面的入口检查，被库里的 WHERE 拦住的那条走这里
          res.status(200).json({
            success: true,
            alreadyUnlocked: true,
            message: '你已解锁该联系方式，可直接查看',
          });
        } else {
          res.status(400).json({ success: false, message: result.error || '提交失败' });
        }
      }
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }),
);

// ========== GET /api/admin/unlock-contact-requests（管理员查看待审列表）
router.get(
  '/api/admin/unlock-contact-requests',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const records = await paymentsDb.getAllContactUnlockRequests();
    res.status(200).json({ success: true, data: records });
  }),
);

// ========== PUT /api/admin/unlock-contact-requests/:id/approve ==========
router.put(
  '/api/admin/unlock-contact-requests/:id(\\d+)/approve',
  requireAdmin(),
  defaultBodyLimit(),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const data = JSON.parse(req.body);
      const success = await paymentsDb.approveContactUnlockRequest(id, data.admin_note || '');
      if (!success) {
        res.status(404).json({ success: false, message: '该申请记录已不存在，未做改动' });
        return;
      }
      await adminDb.logAdminAction('approve_contact_unlock', String(id), {
        note: data.admin_note || '',
      });
      res.status(200).json({ success: true, message: '已通过审核' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }),
);

// ========== PUT /api/admin/unlock-contact-requests/:id/reject ==========
// 驳回不删图（要留证据）：只有下面 DELETE 那条显式删除记录才把盘上那张凭证图一起清掉
router.put(
  '/api/admin/unlock-contact-requests/:id(\\d+)/reject',
  requireAdmin(),
  defaultBodyLimit(),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const data = JSON.parse(req.body);
      const success = await paymentsDb.rejectContactUnlockRequest(id, data.admin_note || '');
      if (!success) {
        res.status(404).json({ success: false, message: '该申请记录已不存在，未做改动' });
        return;
      }
      await adminDb.logAdminAction('reject_contact_unlock', String(id), {
        note: data.admin_note || '',
      });
      res.status(200).json({ success: true, message: '已拒绝' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }),
);

// ========== DELETE /api/admin/unlock-contact-requests/:id ==========
router.delete(
  '/api/admin/unlock-contact-requests/:id(\\d+)',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    const result = await paymentsDb.deleteContactUnlockRequest(id);
    if (!result.deleted) {
      res.status(404).json({ success: false, message: '该申请记录不存在，未做改动' });
      return;
    }
    deleteUploadedFile(result.proofPath);
    await adminDb.logAdminAction('delete_contact_unlock', String(id), {});
    res.status(200).json({ success: true, message: '已删除' });
  }),
);

// ========== POST /api/users/:id/unlock-contact（管理员手动解锁）
router.post(
  '/api/users/:id/unlock-contact',
  requireAdmin(),
  tooLarge400,
  asyncHandler(async (req, res) => {
    const targetId = req.params.id;
    try {
      const data = JSON.parse(req.body);
      const viewerId = String(data.viewer_id || data.viewerId || '').trim();
      // 以前 viewerId 为空时什么都不写，却照样回「解锁成功」——管理员在后台点了按钮、看到成功提示，
      // 实际一个人都没解开，而且这条成功还会进后台操作日志
      if (!viewerId) {
        res.status(400).json({ success: false, message: '缺少要解锁给谁（viewer_id）' });
        return;
      }
      const targetRow = await dbIndex
        .getDb()
        .prepare('SELECT 1 AS hit FROM users WHERE id = $1 LIMIT 1')
        .get(targetId);
      if (!targetRow) {
        res.status(400).json({ success: false, message: '目标资料不存在' });
        return;
      }
      await paymentsDb.unlockContact(viewerId, targetId, '手动解锁');
      await adminDb.logAdminAction('unlock_contact', targetId, {
        viewerId,
        action: 'admin_unlock',
      });
      res.status(200).json({ success: true, message: '解锁成功' });
    } catch (e) {
      res.status(400).json({ success: false, message: '请求格式错误' });
    }
  }),
);

// ========== GET /api/users/:id/check-unlock（查我能不能看这条资料的联系方式）
router.get(
  '/api/users/:id/check-unlock',
  requireToken({ missing: '请先登录', invalid: 'token无效' }),
  asyncHandler(async (req, res) => {
    const targetId = req.params.id;
    const viewerId = req.auth.userId;

    // 查看自己的联系方式无需解锁：比「账号 id === 目标」不够，还要认自己名下其他资料行
    const database = dbIndex.getDb();
    const isSelf = await database
      .prepare(
        'SELECT 1 AS hit FROM users WHERE (id = $1 OR user_id = $1) AND user_id = $2 LIMIT 1',
      )
      .get(targetId, String(viewerId));
    if (isSelf) {
      const row = await database
        .prepare(
          'SELECT contact FROM users WHERE id = $1 OR user_id = $1 ORDER BY (id = $1) DESC LIMIT 1',
        )
        .get(targetId);
      res.status(200).json({
        success: true,
        unlocked: true,
        contact: row && row.contact ? dbIndex.decrypt(row.contact) : null,
      });
      return;
    }

    const isUnlocked = await paymentsDb.checkContactUnlocked(viewerId, targetId);
    if (!isUnlocked) {
      res
        .status(200)
        .json({ success: true, unlocked: false, contact: null, message: '请先解锁联系方式' });
      return;
    }

    // 已解锁，返回解密后的联系方式（同样必须带 ORDER BY，理由见文件头第 3 条）
    const row = await database
      .prepare(
        'SELECT contact FROM users WHERE id = $1 OR user_id = $1 ORDER BY (id = $1) DESC LIMIT 1',
      )
      .get(targetId);
    const targetContact = row && row.contact ? dbIndex.decrypt(row.contact) : null;
    res.status(200).json({ success: true, unlocked: true, contact: targetContact });
  }),
);

// ========== GET /api/admin/unlock-records（已解锁台账）
router.get(
  '/api/admin/unlock-records',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const records = await paymentsDb.getAllUnlockRecords();
    res.status(200).json({ success: true, data: records });
  }),
);

module.exports = router;
