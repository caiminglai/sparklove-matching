// ============================================================
// 限流：七档各管一件事，每档的话逐字钉住
//
// 前端把 429 的 message 直接显示给用户，所以这句话是契约的一部分，不是文案。
// 旧写法另有一个真 bug：滑块档（10/分）和短信档（60/分）共用同一个 rateLimitMap，
// 只是各自拿不同上限去比——刷短信会把滑块一起带进 429。这里每档是独立实例，
// 下面「一档耗尽不牵连另一档」那条就是给这个 bug 上的锁。
//
// 本文件不发真实注册/登录请求（那些要碰库），只用一个挂限流器的最小 app 打，
// 每档走 limit+1 次，最后一口必须撞到 429。
// ============================================================
require('./helpers/env');

const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');

const rl = require('../middleware/rate-limit');
const { RATE_LIMITS } = require('../config');
const { API_ROUTERS, STATIC_ROUTERS } = require('../routes/index.js');

function probeApp(middleware) {
  const app = express();
  app.set('trust proxy', 1); // 与 app.js 同档：req.ip = X-Forwarded-For 最后一跳
  // 按手机号那一档的键要从请求体里取，所以探测 app 也得先把体读成字符串——
  // 和 middleware/body.js 一样用一个全放行的 type 谓词（这里不测 multipart）
  app.use(express.text({ type: () => true }));
  app.post('/probe', middleware, (req, res) => res.status(200).json({ ok: true }));
  return app;
}

// 每次换新 IP，免得上一档的额度漏进下一档（限流键就是 req.ip）
let ipSeed = 0;
const freshIp = () => `10.77.${(ipSeed >> 8) & 255}.${ipSeed++ & 255}`;

/** 连打 n 次，返回每次的 {status, body} */
async function hammer(app, n, { ip = freshIp(), body, headers } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const req = request(app).post('/probe').set('X-Forwarded-For', ip);
    if (headers) for (const [k, v] of Object.entries(headers)) req.set(k, v);
    if (body !== undefined) req.set('Content-Type', 'application/json').send(body);
    const res = await req;
    out.push({ status: res.status, body: res.body, headers: res.headers });
  }
  return out;
}

test('档位数字钉住：改动要连着看理由（config.js 旁边那段话）', () => {
  assert.deepStrictEqual(RATE_LIMITS.write, { limit: 60, windowMs: 60 * 1000 });
  assert.deepStrictEqual(RATE_LIMITS.login, { limit: 100, windowMs: 5 * 60 * 1000 });
  assert.deepStrictEqual(RATE_LIMITS.registerIp, { limit: 30, windowMs: 10 * 60 * 1000 });
  assert.deepStrictEqual(RATE_LIMITS.registerPhone, { limit: 10, windowMs: 60 * 60 * 1000 });
  assert.deepStrictEqual(RATE_LIMITS.captchaVerify, { limit: 10, windowMs: 60 * 1000 });
});

test('每档耗尽后那一口：状态码、这句话、且不带 RateLimit-* 头', async () => {
  const cases = [
    ['writeLimiter', rl.writeLimiter, RATE_LIMITS.write.limit, '操作过于频繁，请稍后再试'],
    ['smsSendLimiter', rl.smsSendLimiter, RATE_LIMITS.write.limit, '发送过于频繁，请稍后再试'],
    ['smsVerifyLimiter', rl.smsVerifyLimiter, RATE_LIMITS.write.limit, '验证过于频繁，请稍后再试'],
    [
      'captchaVerifyLimiter',
      rl.captchaVerifyLimiter,
      RATE_LIMITS.captchaVerify.limit,
      '验证过于频繁，请稍后再试',
    ],
    ['loginLimiter', rl.loginLimiter, RATE_LIMITS.login.limit, '登录尝试过多，请5分钟后再试'],
    [
      'registerIpLimiter',
      rl.registerIpLimiter,
      RATE_LIMITS.registerIp.limit,
      '注册过于频繁，请稍后再试',
    ],
  ];
  for (const [name, limiter, limit, message] of cases) {
    const hits = await hammer(probeApp(limiter), limit + 1);
    const ok = hits.slice(0, limit);
    assert.ok(
      ok.every((h) => h.status === 200),
      name + ' 前 ' + limit + ' 口要放行',
    );
    const last = hits[limit];
    assert.strictEqual(last.status, 429, name);
    assert.deepStrictEqual(last.body, { success: false, message }, name);
    // 现量的 429 响应里本来没有这些头；standardHeaders/legacyHeaders 关错了就会多出 RateLimit-*
    for (const key of Object.keys(last.headers)) {
      assert.ok(!/^ratelimit-/i.test(key), name + ' 多了响应头 ' + key);
    }
  }
});

test('一档耗尽不牵连另一档：旧写法共用一个 Map 的那个 bug 不许回来', async () => {
  // 同一个 IP 先把滑块档打满，再打短信档——短信档必须还是通的
  const ip = freshIp();
  const captcha = probeApp(rl.captchaVerifyLimiter);
  const sms = probeApp(rl.smsSendLimiter);
  const drained = await hammer(captcha, RATE_LIMITS.captchaVerify.limit + 1, { ip });
  assert.strictEqual(drained[drained.length - 1].status, 429);
  const untouched = await hammer(sms, 1, { ip });
  assert.strictEqual(untouched[0].status, 200, '滑块那档不能消耗短信的额度');
});

test('限流键按 IP：换一个出口 IP 就是新的一份额度，同一 IP 的第二口连着计', async () => {
  const limiter = rl.makeLimiter({ ...RATE_LIMITS.captchaVerify, message: 'M' });
  const app = probeApp(limiter);
  const a = await hammer(app, RATE_LIMITS.captchaVerify.limit + 1, { ip: '203.0.113.9' });
  assert.strictEqual(a[a.length - 1].status, 429);
  const b = await hammer(app, 1, { ip: '198.51.100.4' });
  assert.strictEqual(b[0].status, 200);
});

test('注册按手机号那一档：号码各算各的，与出口 IP 无关', async () => {
  const ip = freshIp();
  const app = probeApp(rl.registerPhoneGate);
  const P1 = { phone: '13800000001' };
  const P2 = { phone: '13800000002' };
  const first = await hammer(app, RATE_LIMITS.registerPhone.limit + 1, { ip, body: P1 });
  assert.strictEqual(first[first.length - 1].status, 429, '现量=' + first[first.length - 1].status);
  assert.deepStrictEqual(first[first.length - 1].body, {
    success: false,
    message: '该手机号注册过于频繁，请1小时后再试',
  });
  // 同一个 IP 换个号：旧写法按 IP 一刀切会把无关访客一起锁死，现在按号分桶
  const second = await hammer(app, 1, { ip, body: P2 });
  assert.strictEqual(second[0].status, 200);
});

test('注册按手机号那一档只在取到号时才生效：取不到就放行给 handler 报错', async () => {
  const app = probeApp(rl.registerPhoneGate);
  const ip = freshIp();
  // 坏 JSON（旧写法也是先 parse 失败就整条报错）、没带 phone、GET 无体三种都必须跳过这一档，
  // 否则注册页连"手机号格式不正确"这句都看不到，先撞上 429
  for (const body of ['{"phone":', { nickname: '没号' }, {}, '']) {
    const hits = await hammer(app, RATE_LIMITS.registerPhone.limit + 3, { ip, body });
    assert.ok(
      hits.every((h) => h.status === 200),
      '这一种体不该吃按号的闸：' + JSON.stringify(body),
    );
  }
});

test('真接口上的顺序：自定义字段写入口先过限流再过鉴权（429 不是 401）', async () => {
  const { createApp } = require('../app');
  const app = createApp();
  const ip = freshIp();
  const first = await request(app)
    .post('/api/users/custom-fields')
    .set('X-Forwarded-For', ip)
    .set('Content-Type', 'application/json')
    .send({});
  assert.strictEqual(first.status, 401, '现量=' + first.status + ' ' + JSON.stringify(first.body));
  assert.strictEqual(first.body.message, '请先登录');

  // 把这一档剩的额度打满（第一口已计），下一口必须换成那句 429——
  // 旧写法就是 checkRateLimit 在 handler 之前，这条顺序是运维看文案能分清卡在哪道闸的依据
  for (let i = 1; i < RATE_LIMITS.write.limit; i++) {
    await request(app)
      .post('/api/users/custom-fields')
      .set('X-Forwarded-For', ip)
      .set('Content-Type', 'application/json')
      .send({});
  }
  const over = await request(app)
    .post('/api/users/custom-fields')
    .set('X-Forwarded-For', ip)
    .set('Content-Type', 'application/json')
    .send({});
  assert.strictEqual(over.status, 429, '现量=' + over.status + ' ' + JSON.stringify(over.body));
  assert.deepStrictEqual(over.body, { success: false, message: '操作过于频繁，请稍后再试' });

  // 同一 IP 的 GET 不计这档额度（skip 在中间件内部）：资料页首屏是匿名批量读
  for (let i = 0; i < 5; i++) {
    const g = await request(app).get('/api/users/custom-fields').set('X-Forwarded-For', ip);
    assert.strictEqual(g.status, 401, 'GET 不该消耗写入口额度，也不该被这档拦下');
  }
});

test('哪些入口挂了哪一档：拿模块引用的身份逐条对上（漏挂/多挂都会红）', () => {
  const NAMES = new Map([
    [rl.writeLimiter, 'write'],
    [rl.smsSendLimiter, 'smsSend'],
    [rl.smsVerifyLimiter, 'smsVerify'],
    [rl.captchaVerifyLimiter, 'captchaVerify'],
    [rl.loginLimiter, 'login'],
    [rl.registerIpLimiter, 'registerIp'],
    [rl.registerPhoneGate, 'registerPhone'],
  ]);
  const found = new Map();
  for (const router of [...STATIC_ROUTERS, ...API_ROUTERS]) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const names = layer.route.stack.map((h) => NAMES.get(h.handle)).filter(Boolean);
      if (!names.length) continue;
      const methods = Object.keys(layer.route.methods);
      const p = Array.isArray(layer.route.path) ? layer.route.path[0] : layer.route.path;
      // Express 4 的 router.all(...) 不摊成七个方法键，它记一个 `_all`（见 route-parity 那条计数口径）。
      // 这里把它写成 ALL，读的人一眼看出"这条闸吃所有方法"
      const key =
        (methods.length === 1 && methods[0] === '_all' ? 'ALL' : methods[0].toUpperCase()) +
        ' ' +
        p;
      found.set(key, names.sort());
    }
  }
  const expected = {
    'POST /api/auth/register': ['registerIp', 'registerPhone'],
    'POST /api/auth/login': ['login'],
    'POST /api/admin/login': ['login'],
    'POST /api/auth/captcha/verify': ['captchaVerify'],
    'POST /api/auth/sms/register-code': ['smsSend'],
    'POST /api/auth/sms/verify-register-code': ['smsVerify'],
    'ALL /api/users/custom-fields': ['write'],
  };
  for (const [key, names] of Object.entries(expected)) {
    assert.deepStrictEqual(
      found.get(key),
      names,
      '这一条的限流档对不上：' + key + ' 现量=' + JSON.stringify(found.get(key)),
    );
  }
  // 反向也要锁：新增一条带限流的入口必须在这里点名，不能悄悄多一道闸
  assert.deepStrictEqual(
    [...found.keys()].sort(),
    Object.keys(expected).sort(),
    '挂了限流的入口集合变了：' + JSON.stringify([...found.keys()].sort()),
  );
});
