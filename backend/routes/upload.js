// ============================================================
// 路由 - 上传（头像 / 认证费凭证）
//
// 旧写法这两条是自己从 req 流里一段段切 multipart 的（routes/upload.js 里那 50 行
// while + indexOf(boundaryStr)），和 utils/multipart.js 那份解析器同名不同实现。
// 现在收口到 middleware/upload.js 的 multer，路由只留"取哪一段、验什么、落到哪"。
//
// ⚠ 本轮动到行为的两处，都是修洞不是漂移：
//   1) 头像的魔术数字判据原来是 `if (expectedMagic && data.length >= expectedMagic.length)`
//      ——小于签名的文件（比如 2 字节的 .png）压根不进判断，直接算通过并落盘。
//      现在统一走 validateMagicBytes：短于签名就是 false。正常图片不受影响。
//   2) 原来"超限只拦落盘、不拦内存"，2GB 的请求体会先在内存里攒齐再回 413；
//      multer 的 fileSize 是在收流的过程中拦的。
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const userDb = require('../db/users.js');
const paymentsDb = require('../db/payments.js');
const pricing = require('../utils/pricing');
const { ALLOWED_IMAGE_EXTENSIONS, validateMagicBytes } = require('../utils/file-validation');

const { requireToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/async-handler');
const { avatarUpload, depositProofUpload, fileField } = require('../middleware/upload');

const router = express.Router({ strict: true }); // strict：尾斜杠不当同一条，理由见 routes/index.js 头部

const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', 'uploads');

// ========== POST /api/upload/avatar
// 后台令牌也能调这一条（旧写法先 isAdminToken 再 verifyToken，两把都认），
// 所以下游拿 userId 时要按 null 处理——管理员不属于任何一条资料，只传图不落库
router.post(
  '/api/upload/avatar',
  requireToken({ missing: '未登录', invalid: 'token无效', allowAdmin: true }),
  avatarUpload,
  asyncHandler(async (req, res) => {
    const uploadsDir = path.join(UPLOADS_ROOT, 'avatars');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    try {
      const file = fileField(req, 'avatar');
      if (!file) {
        res.status(400).json({ success: false, message: '未找到头像文件' });
        return;
      }
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
        res.status(400).json({ success: false, message: '不支持的文件类型' });
        return;
      }
      if (!validateMagicBytes(file.buffer, ext)) {
        res.status(400).json({ success: false, message: '文件内容与扩展名不匹配' });
        return;
      }
      const savedName = 'avatar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + ext;
      const savePath = path.join(uploadsDir, savedName);
      fs.writeFileSync(savePath, file.buffer);
      const avatarUrl = '/uploads/avatars/' + savedName;

      const targetUserId = req.auth.userId || null;
      if (targetUserId) {
        const users = await userDb.getUsersByUserId(targetUserId);
        if (users.length > 0) {
          const existing = users[0];
          existing.data = existing.data || {};
          existing.data.avatar = avatarUrl;
          await userDb.updateUser(existing.id, existing);
        }
      }
      res.status(200).json({ success: true, avatar: avatarUrl });
    } catch (e) {
      res.status(500).json({ success: false, message: '上传失败' });
    }
  }),
);

// ========== POST /api/deposit/upload-proof（认证费转账截图）
// 修复：原第三参 ADMIN_TOKEN 永远 undefined（server.js 调用时未传），且函数内未使用，删除
router.post(
  '/api/deposit/upload-proof',
  requireToken({ missing: '未登录', invalid: 'token无效' }),
  depositProofUpload,
  asyncHandler(async (req, res) => {
    const userId = req.auth.userId;
    const uploadsDir = path.join(UPLOADS_ROOT, 'deposits');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    try {
      const file = fileField(req, 'proof');
      if (!file) {
        res.status(400).json({ success: false, message: '未找到凭证文件' });
        return;
      }
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
        res.status(400).json({ success: false, message: '不支持的文件类型' });
        return;
      }
      if (!validateMagicBytes(file.buffer, ext)) {
        res.status(400).json({ success: false, message: '文件内容不匹配' });
        return;
      }
      // 🔴 不读表单里的 amount 字段：那是前端传来的数字，改一个字就能把 29.9 的认证费按 0.01 记账
      const amount = await pricing.getYuan('deposit');
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const safeFilename = userId + '_' + timestamp + '_' + randomStr + ext;
      fs.writeFileSync(path.join(uploadsDir, safeFilename), file.buffer);
      const proofPath = '/uploads/deposits/' + safeFilename;
      const depositRecord = {
        user_id: userId,
        amount: amount,
        proof_path: proofPath,
        status: 'pending',
        created_at: timestamp,
      };
      await paymentsDb.addDeposit(userId, amount, proofPath);
      res.status(200).json({ success: true, message: '凭证已提交，等待审核', data: depositRecord });
    } catch (err) {
      res.status(500).json({ success: false, message: '上传失败: ' + err.message });
    }
  }),
);

module.exports = router;
