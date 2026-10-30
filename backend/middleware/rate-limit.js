// ============================================================
// 中间件 - 限流
//
// 七档全部收在这一个文件里，改数字的人只需要一个地址；每档为什么这么定写在旁边。
// 键用 req.ip（app.set('trust proxy', 1) 之后它等于 X-Forwarded-For 的最后一跳，
// 也就是 Caddy 追加的那个直连地址——自带一条伪造头就能换一份额度那种事不再成立）。
//
// 与旧写法的一处口径差别，是修 bug 不是漂移：
// 旧的 checkRateLimit / checkLoginRateLimit / checkRegisterRateLimit 各用一个 Map，
// 但滑块档（10/分）和短信档（60/分）共用的是同一个 rateLimitMap，只是各自拿不同的上限去比——
// 于是刷短信能把滑块验证一起带进 429。这里每档独立计数，滑块那 10 次只由滑块自己消耗。
//
// 另一处：旧写法在 handler 内部先判限流再读请求体，现在请求体由全局 body 解析先读过，
// 所以「又超限又被限流」的那条请求回 413 而不是 429。只有把 5MB 以上的大体打满额度才碰得到。
// ============================================================

const rateLimit = require('express-rate-limit');
const { RATE_LIMITS } = require('../config');

/**
 * 造一档限流。
 * 两个 RateLimit-* 头都关掉：本站现量的 429 响应里本来没有这些头，
 * 加了会改每一条响应的头集合，想引入它得单独一轮。
 * @param {{limit:number, windowMs:number, message:string, keyFor?: (req)=>string, skip?:(req)=>boolean}} config
 */
function makeLimiter({ limit, windowMs, message, keyFor, skip }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: false,
    legacyHeaders: false,
    ...(keyFor ? { keyGenerator: (req) => keyFor(req) } : {}),
    ...(skip ? { skip } : {}), // skip 命中的请求不计数，与"挂在它后面的分支"等价，但少一层包装
    handler: (req, res) => {
      res.status(429).json({ success: false, message });
    },
  });
}

// 通用写入口档：自定义字段写操作用（短信那两条各有自己的档，措辞不同）。
// 服务层只按手机号做了 60 秒防重，换一个号就能绕过，所以这里补按 IP 的闸。
// GET 跳过是承重的：资料页渲染要批量读字段， anon 首屏就会被自己的读请求限死。
const writeLimiter = makeLimiter({
  ...RATE_LIMITS.write,
  message: '操作过于频繁，请稍后再试',
  skip: (req) => req.method === 'GET',
});

// 短信发送：措辞与旧写法逐字一致（前端文案直接透传这个字段）
const smsSendLimiter = makeLimiter({
  ...RATE_LIMITS.write,
  message: '发送过于频繁，请稍后再试',
});

// 短信校验：6 位数字验证码，只闸发送不闸校验等于留下另一半
const smsVerifyLimiter = makeLimiter({
  ...RATE_LIMITS.write,
  message: '验证过于频繁，请稍后再试',
});

// 滑块校验：验证成功会签发一枚放行注册的 token，不限速就能脚本猜坐标 ⇒ 比其他写入口更紧
const captchaVerifyLimiter = makeLimiter({
  ...RATE_LIMITS.captchaVerify,
  message: '验证过于频繁，请稍后再试',
});

// 登录：按 IP 收紧，只挡明显的脚本洪水
const loginLimiter = makeLimiter({
  ...RATE_LIMITS.login,
  message: '登录尝试过多，请5分钟后再试',
});

// 注册按 IP：与登录同理，宽口径——移动网络出口 IP 被整片用户共享，收紧会连带锁死无关访客
const registerIpLimiter = makeLimiter({
  ...RATE_LIMITS.registerIp,
  message: '注册过于频繁，请稍后再试',
});

// 注册按手机号：真正能精准指向滥用的是号码本身，防止有人拿一个出口批量注册。
// 键要从请求体里取，所以这一档必须挂在 body 解析之后。
// 请求体不是合法 JSON 时取不到号码 ⇒ 跳过这一档，交给 handler 里那句 JSON.parse
// 走它自己的错误分支（与旧写法同：旧写法也是先 parse 失败就整条报错）。
const registerPhoneLimiter = makeLimiter({
  ...RATE_LIMITS.registerPhone,
  message: '该手机号注册过于频繁，请1小时后再试',
  keyFor: (req) => `phone:${phoneOf(req) || `anon:${req.ip}`}`,
});

/** 从已经解析成字符串的请求体里取手机号，取不到回 null（不抛错） */
function phoneOf(req) {
  const raw = typeof req.body === 'string' ? req.body : null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.phone ? String(parsed.phone) : null;
  } catch {
    return null;
  }
}

/**
 * 带手机号的注册请求才吃这一档；空手请求直接放行到 handler。
 * 挂在 register 路由上，不挂全局。
 */
function registerPhoneGate(req, res, next) {
  if (!phoneOf(req)) return next();
  return registerPhoneLimiter(req, res, next);
}

module.exports = {
  makeLimiter,
  writeLimiter,
  smsSendLimiter,
  smsVerifyLimiter,
  captchaVerifyLimiter,
  loginLimiter,
  registerIpLimiter,
  registerPhoneGate,
};
