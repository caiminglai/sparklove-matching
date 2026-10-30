// ============================================================
// 路由 - 认证（注册 / 登录 / 退出 / 改密 / 管理员登录 / 滑块 / 短信预留口）
//
// 这一族原来靠 server.js 把 (req, res, readBodyWithLimit, checkXxxRateLimit) 一串参数
// 手动传进来（旧 server.js:316-350）。现在限流和请求体都是挂在路由上的中间件，
// handler 只剩 (req, res)，读体统一成 req.body。
//
// ⚠ 一块砖都不能动的地方：
//   1) 「体不是合法 JSON」在每一条接口里的落点不一样——login 回 400「登录失败」、
//      register 回 500「注册失败」、captcha/verify 回 500「验证失败」。
//      这是各 handler 自己那个 try 包住 JSON.parse 造成的既成事实，
//      所以这里继续用 req.body + handler 内 JSON.parse，不换成 express.json。
//   2) 429 的文案逐字保留：前端把 message 直接显示给用户。
//   3) 改密码走的是 authService.getCurrentUser（异步查库），不是 verifyToken，
//      它的 401 判据和别的接口不同源，不能顺手统一。
// ============================================================

const express = require('express');

const authService = require('../services/auth.service');
const adminService = require('../services/admin.service');
const captchaService = require('../services/captcha.service');
const smsService = require('../services/sms.service');
const { generateAdminToken } = require('../db/index');
const { setAuthCookie, clearAuthCookie } = require('../utils/cookie工具');

const { asyncHandler } = require('../middleware/async-handler');
const { bearerToken } = require('../middleware/auth');
const { defaultBodyLimit } = require('../middleware/body');
const {
  loginLimiter,
  registerIpLimiter,
  registerPhoneGate,
  smsSendLimiter,
  smsVerifyLimiter,
  captchaVerifyLimiter,
} = require('../middleware/rate-limit');

const router = express.Router({ strict: true }); // strict：尾斜杠不当同一条，理由见 routes/index.js 头部

// ========== POST /api/auth/register
// 两道闸各管一件事（额度见 config 的 RATE_LIMITS）：
// IP 那道只挡明显的脚本洪水，因为移动网络的出口 IP 被整片用户共享，按 IP 收紧会连带锁死无关访客；
// 真正能精准指向滥用的是手机号本身，所以按 phone 再限一道，防止有人拿一个出口批量注册。
router.post(
  '/api/auth/register',
  registerIpLimiter,
  defaultBodyLimit(),
  registerPhoneGate,
  asyncHandler(async (req, res) => {
    try {
      const data = JSON.parse(req.body);
      // 滑动验证：后端这套（/api/auth/captcha 与 checkCaptchaToken）已修好且按一次性令牌销毁，
      // 但注册页现在压根没接这条流程——现量：app/src 里除一处敏感词正则，没有任何组件请求过 /auth/captcha。
      // 这里贸然放开判据会把注册全站死（没人交得出 captchaToken），所以维持跳过，
      // 等注册页接上滑块再把下面这段解注释；这是产品决定，不是漏改
      // if (!captchaService.checkCaptchaToken(data.captchaId, data.captchaToken)) {
      //   res.status(400).json({ success: false, message: '滑动验证无效或已过期，请重新验证' });
      //   return;
      // }
      const result = await authService.register(data.phone, data.password, data.nickname);
      if (result.success) setAuthCookie(res, result.token);
      res.status(result.success ? 200 : 400).json(result);
    } catch (e) {
      console.error('[register error]', e.message || e);
      // 兼容 PostgreSQL (duplicate key) 和 SQLite (UNIQUE constraint) 的唯一约束冲突错误
      if (
        e.code === '23505' ||
        (e.message &&
          (e.message.includes('duplicate key') || e.message.includes('UNIQUE constraint failed')))
      ) {
        res.status(400).json({ success: false, message: '该手机号已注册' });
      } else {
        res.status(500).json({ success: false, message: '注册失败' });
      }
    }
  }),
);

// ========== POST /api/auth/login
router.post(
  '/api/auth/login',
  loginLimiter,
  defaultBodyLimit(),
  asyncHandler(async (req, res) => {
    try {
      const data = JSON.parse(req.body);
      const result = await authService.login(data.phone, data.password);
      if (result.success) setAuthCookie(res, result.token);
      res.status(result.success ? 200 : 401).json(result);
    } catch (e) {
      res.status(400).json({ success: false, message: '登录失败' });
    }
  }),
);

// ========== POST /api/auth/logout
// 只清 httpOnly cookie。token 本身是无状态 HMAC，服务端没有会话表可以撤，
// 所以「退出后这枚 token 还能用」是这套方案的固有限制，不是这里漏写的一步：
// 前端同步清掉 localStorage 里的 auth_token，浏览器端就再也拿不出它；
// 真正泄露出去的 token 要撤回，得等引入服务端黑名单/短有效期那天。
// 不需要登录态也能调：登录态已过期的用户点退出同样应该把 cookie 清掉
router.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.status(200).json({ success: true, message: '已退出登录' });
});

// ========== POST /api/auth/change-password
// 身份这一步单独拆成中间件，是为了保住旧写法的顺序：先查令牌、再碰请求体。
// 旧的 changePassword 在无 Authorization 时直接回 401，连体都不读；
// 如果把它压进 handler 里、让 defaultBodyLimit 排在前面，
// 「没登录 + 超大体」就会从 401 变成 413——一条排查方向完全不同的响应。
async function resolvePasswordChangeUser(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: '未登录' });
    return;
  }
  const userId = (await authService.getCurrentUser(token))?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: 'token无效' });
    return;
  }
  req.auth = { token, userId, isAdmin: false };
  next();
}

router.post(
  '/api/auth/change-password',
  resolvePasswordChangeUser,
  defaultBodyLimit(),
  asyncHandler(async (req, res) => {
    try {
      const data = JSON.parse(req.body);
      const result = await authService.changePassword(
        req.auth.userId,
        data.oldPassword,
        data.newPassword,
      );
      res.status(result.success ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ success: false, message: '修改密码失败' });
    }
  }),
);

// ========== POST /api/admin/login（旧写法同时接 /api/admin 这一条简写，一并保留）
router.post(
  ['/api/admin/login', '/api/admin'],
  loginLimiter,
  defaultBodyLimit(),
  asyncHandler(async (req, res) => {
    try {
      const data = JSON.parse(req.body);
      // 兼容旧版仅传 password 的调用：未传 username 时使用默认管理员账号
      const username = data.username || process.env.ADMIN_USERNAME || 'admin';
      const password = data.password;
      const result = await adminService.verifyAdminAccount(username, password);
      if (result.success) {
        const token = generateAdminToken(result.username);
        res.status(200).json({ success: true, token, username: result.username });
      } else {
        res.status(401).json({ success: false, message: result.message || '管理员账号或密码错误' });
      }
    } catch (e) {
      console.error('[adminLogin error]', e.message || e);
      res.status(400).json({ success: false, message: '登录失败' });
    }
  }),
);

// ========== GET /api/auth/captcha
router.get('/api/auth/captcha', (req, res) => {
  try {
    const captcha = captchaService.createCaptcha();
    res.status(200).json({ success: true, data: captcha });
  } catch (e) {
    res.status(500).json({ success: false, message: '验证码生成失败' });
  }
});

// ========== POST /api/auth/captcha/verify
// 验证成功会签发一枚放行注册的 token，不限速就能脚本猜滑块坐标；这一档比其他写入口更紧
router.post(
  '/api/auth/captcha/verify',
  captchaVerifyLimiter,
  defaultBodyLimit(),
  asyncHandler(async (req, res) => {
    try {
      const data = JSON.parse(req.body);
      const result = captchaService.verifyCaptcha(data.captchaId, data.x);
      res.status(200).json({
        success: result.success,
        data: result.success ? { token: result.token } : null,
        message: result.message,
      });
    } catch (e) {
      res.status(500).json({ success: false, message: '验证失败' });
    }
  }),
);

// ========== 短信验证预留接口
// 服务层只按手机号做了 60 秒防重，换一个号就能绕过，所以这两条各挂一道按 IP 的闸；
// 校验这一半也必须闸——6 位数字验证码，只闸发送不闸校验等于留下另一半
router.post(
  '/api/auth/sms/register-code',
  smsSendLimiter,
  defaultBodyLimit(),
  asyncHandler(async (req, res) => {
    try {
      const data = JSON.parse(req.body);
      const result = smsService.sendRegisterCode(data.phone);
      res.status(result.success ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ success: false, message: '发送验证码失败' });
    }
  }),
);

router.post(
  '/api/auth/sms/verify-register-code',
  smsVerifyLimiter,
  defaultBodyLimit(),
  asyncHandler(async (req, res) => {
    try {
      const data = JSON.parse(req.body);
      const result = smsService.verifyRegisterCode(data.phone, data.code);
      res.status(result.success ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ success: false, message: '校验验证码失败' });
    }
  }),
);

module.exports = router;
