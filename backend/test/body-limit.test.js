// ============================================================
// 请求体：三档上限各由谁先拒、拒了说哪句话
//
// 契约基线里这一族的关键不是"有没有限流"，而是**谁先拒**：
//   · 全局只有一道 express.text，上限放到最宽那一档（BODY_HARD_LIMIT = 向量批量的 2 倍），
//     它只负责挡内存，不负责说话；
//   · 各入口自己的上限由 bodyLimit() 在那条路由上说（defaultBodyLimit = 5MB 那句 413）；
//   · 支付下单与两条异步通知不走中间件，用 textWithinLimit 在 handler 自己的 try 里抛，
//     于是「超限」和「体不是合法 JSON」落进同一个 catch，回的是各自 handler 那一句。
// 顺序一变，状态码和文案就一起变——下面每一条都钉着一个具体的"谁在前"。
// ============================================================
require('./helpers/env');

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { createApp } = require('../app');
const {
  textWithinLimit,
  bodyLimit,
  defaultBodyLimit,
  isMultipart,
  normalizeEmptyBody,
} = require('../middleware/body');
const { MAX_BODY_SIZE, BODY_HARD_LIMIT, MAX_VECTOR_BODY } = require('../config');
const { userToken, FORGED_TOKEN } = require('./helpers/tokens');

const TOO_BIG = '请求体过大，最大允许5MB';

// ---------- 假 req/res：只测中间件本身，不进 HTTP ----------
function fakeRes() {
  const res = {
    statusCode: null,
    payload: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.payload = body;
      return res;
    },
  };
  return res;
}

test('上限之间的大小关系是承重的：全局闸必须比最宽那条路由高一档', () => {
  // 全局闸若 ≤ 向量批量档，「谁先拒」就换人：body-parser 抢在路由复检之前抛
  // entity.too.large，那条入口历史上的 500「请求体过大」再也复现不出来
  assert.ok(BODY_HARD_LIMIT > MAX_VECTOR_BODY, BODY_HARD_LIMIT + ' > ' + MAX_VECTOR_BODY);
  assert.strictEqual(MAX_BODY_SIZE, 5 * 1024 * 1024);
  assert.strictEqual(MAX_VECTOR_BODY, 10 * 1024 * 1024);
  assert.strictEqual(BODY_HARD_LIMIT, 20 * 1024 * 1024);
});

test('textWithinLimit：取原文、超限抛那句、非字符串当空', () => {
  assert.strictEqual(textWithinLimit({ body: '{"a":1}' }), '{"a":1}');
  assert.strictEqual(textWithinLimit({ body: undefined }), '');
  assert.strictEqual(textWithinLimit({ body: { a: 1 } }), '');
  assert.throws(
    () => textWithinLimit({ body: 'x'.repeat(MAX_BODY_SIZE + 1) }),
    (err) => {
      assert.strictEqual(err.message, TOO_BIG);
      return true;
    },
  );
  // 正好等于上限不收（旧 readBodyWithLimit 是 > 不是 >=）
  assert.strictEqual(textWithinLimit({ body: 'x'.repeat(MAX_BODY_SIZE) }).length, MAX_BODY_SIZE);
});

test('bodyLimit / defaultBodyLimit：超限就地 413，没超限才往下走', () => {
  const over = fakeRes();
  let calledNext = false;
  defaultBodyLimit()({ body: 'x'.repeat(MAX_BODY_SIZE + 1) }, over, () => (calledNext = true));
  assert.strictEqual(over.statusCode, 413);
  assert.deepStrictEqual(over.payload, { success: false, message: TOO_BIG });
  assert.strictEqual(calledNext, false);

  const under = fakeRes();
  defaultBodyLimit()({ body: '{}' }, under, () => (calledNext = true));
  assert.strictEqual(under.statusCode, null);
  assert.strictEqual(calledNext, true);

  // 点名上限与措辞的路由（向量批量）用自己的那一档：状态码和话都能被覆盖
  const vector = fakeRes();
  bodyLimit(MAX_VECTOR_BODY, { status: 500, message: '请求体过大' })(
    { body: 'y'.repeat(MAX_VECTOR_BODY + 1) },
    vector,
    () => {},
  );
  assert.strictEqual(vector.statusCode, 500);
  assert.deepStrictEqual(vector.payload, { success: false, message: '请求体过大' });
});

test('normalizeEmptyBody：express.text 之后没体就是空串（handler 里 JSON.parse 才不炸 TypeError）', () => {
  const a = { body: undefined };
  normalizeEmptyBody(a, {}, () => {});
  assert.strictEqual(a.body, '');

  const b = { body: null };
  normalizeEmptyBody(b, {}, () => {});
  assert.strictEqual(b.body, null, '只归 undefined，别的不动');
});

test('isMultipart：只有 multipart 交给 multer，其余都由全局 text 收', () => {
  assert.strictEqual(
    isMultipart({ headers: { 'content-type': 'multipart/form-data; boundary=x' } }),
    true,
  );
  assert.strictEqual(isMultipart({ headers: { 'content-type': 'application/json' } }), false);
  assert.strictEqual(isMultipart({ headers: {} }), false);
});

// ---------- 进 HTTP：钉住「谁先拒」 ----------
test('普通 JSON 入口 6MB：先过登录闸再复检上限，所以是 413 那句', async () => {
  const app = createApp();
  const big = JSON.stringify({ comment: 'x'.repeat(6 * 1024 * 1024) });
  const res = await request(app)
    .post('/api/ratings')
    .set('Authorization', 'Bearer ' + userToken())
    .set('Content-Type', 'application/json')
    .send(big);
  assert.strictEqual(res.status, 413, '现量=' + res.status + ' ' + String(res.text).slice(0, 80));
  assert.deepStrictEqual(res.body, { success: false, message: TOO_BIG });
});

test('21MB 由全局闸先挡：连路由都没匹配上，也要回同一句话', async () => {
  const app = createApp();
  const huge = 'x'.repeat(21 * 1024 * 1024);
  // /api/nope 压根没有这条路由。全局 body 解析排在路由之前，所以这条先 413 而不是 404——
  // 这正是「全局闸只挡内存、话由 error-handler 折算成旧那句」的落点
  const big = await request(app)
    .post('/api/nope')
    .set('Content-Type', 'application/json')
    .send(huge);
  assert.strictEqual(big.status, 413, '现量=' + big.status);
  assert.deepStrictEqual(big.body, { success: false, message: TOO_BIG });

  const small = await request(app)
    .post('/api/nope')
    .set('Content-Type', 'application/json')
    .send('{}');
  assert.strictEqual(small.status, 404);
  assert.strictEqual(small.text, 'Not Found');
});

test('multipart 不被全局 text 读过：非上传路由收到 multipart 时体一律是空串', async () => {
  // /api/ratings 只吃 JSON。multipart 由 type 谓词挡在门外（multer 那条流不能被两个读者都读一次），
  // 于是 req.body 归一成 ''，handler 自己的 JSON.parse('') 抛错收尾——
  // 旧写法同样是读到手再 JSON.parse 失败回这句（git show HEAD:backend/server.js 的 readBodyWithLimit）。
  //
  // 顺带记下这一族唯一的口径差：超大体。旧写法在累到 5MB 的那一刻 reject 之后还 req.destroy()
  // （HEAD:server.js:129-131），客户端拿到的是连接被掐断；新写法在全局 20MB 闸之内由那条路由
  // 自己回干净的 413 那句。旧的那头本来就没有可读的应答，所以这不是措辞漂移，是把断连换成有答。
  const app = createApp();
  const tiny =
    '--------------------------x\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n----------------------------x--\r\n';
  const res = await request(app)
    .post('/api/ratings')
    .set('Authorization', 'Bearer ' + FORGED_TOKEN)
    .set('Content-Type', 'multipart/form-data; boundary=------------------------x')
    .send(tiny);
  assert.strictEqual(res.status, 500, '现量=' + res.status + ' ' + String(res.text).slice(0, 80));
  assert.deepStrictEqual(res.body, { success: false, message: '评价失败' });
});

test('支付两条异步通知：超限落进 handler 自己的 catch，回的是各自那一句', async () => {
  const app = createApp();
  const big = 'x'.repeat(MAX_BODY_SIZE + 1024);

  const wechat = await request(app)
    .post('/api/payment/notify-wechat')
    .set('Content-Type', 'application/json')
    .send(big);
  assert.strictEqual(
    wechat.status,
    500,
    '现量=' + wechat.status + ' ' + String(wechat.text).slice(0, 120),
  );
  assert.deepStrictEqual(wechat.body, { code: 'FAIL', message: TOO_BIG });

  // 支付宝只认 'success'/'fail' 两个词：应答 200 + 裸文本，头值逐字是 text/plain（不带 charset）
  const alipay = await request(app)
    .post('/api/payment/notify-alipay')
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .send(big);
  assert.strictEqual(alipay.status, 200);
  assert.strictEqual(
    alipay.headers['content-type'],
    'text/plain',
    '现量=' + alipay.headers['content-type'],
  );
  assert.strictEqual(alipay.text, 'fail');
});

test('支付宝通知的小体也在碰库之前就回 fail（验签不过压根进不了业务）', async () => {
  const res = await request(createApp())
    .post('/api/payment/notify-alipay')
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .send('out_trade_no=nope&trade_status=TRADE_SUCCESS&total_amount=0.01&sign=abc');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['content-type'], 'text/plain');
  assert.strictEqual(res.text, 'fail');
});

test('坏 JSON 不被抢跑：三套措辞各归各的 handler（换成 express.json 就被抹平成一句）', async () => {
  const app = createApp();
  const broken = '{"a":';

  const order = await request(app)
    .post('/api/payment/create')
    .set('Authorization', 'Bearer ' + userToken())
    .set('Content-Type', 'application/json')
    .send(broken);
  assert.strictEqual(
    order.status,
    500,
    '现量=' + order.status + ' ' + String(order.text).slice(0, 120),
  );
  assert.strictEqual(order.body.success, false);
  assert.ok(/JSON|json/.test(order.body.message), 'V8 那句原文：' + order.body.message);

  const login = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send(broken);
  assert.strictEqual(login.status, 400);
  assert.strictEqual(login.body.message, '登录失败');

  const captcha = await request(app)
    .post('/api/auth/captcha/verify')
    .set('Content-Type', 'application/json')
    .send(broken);
  assert.strictEqual(captcha.status, 500);
  assert.strictEqual(captcha.body.message, '验证失败');
});
