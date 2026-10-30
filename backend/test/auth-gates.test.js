// ============================================================
// 鉴权闸：谁在哪一道卡住、卡住时说哪句话
//
// 这一族是改 HTTP 层时最容易悄悄漂移的地方：措辞分开不是好看，
// 「没带凭据」和「带了但对不上」是两种排查方向，管理员闸和用户闸的口径也不同源。
// 逐条话与状态码取自改前 126 条契约基线（E:/website/站2产生临时文件/baseline-old.json），
// 这里只收「不碰库也能兑现」的那些——库在后面的分支（比如改密码要先查 currentUser）
// 归容器彩排那一轮，不在本文件。
// ============================================================
require('./helpers/env');

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { createApp } = require('../app');
const { cookieAuthBridge, bearerToken } = require('../middleware/auth');
const {
  parseCookies,
  getAuthTokenFromCookie,
  setAuthCookie,
  clearAuthCookie,
} = require('../utils/cookie工具');
const { userToken, FORGED_TOKEN } = require('./helpers/tokens');

// POST 类的匿名请求统一带一个 `{}`：旧写法是 handler 里 JSON.parse，
// 空体（''）会先撞 SyntaxError、落进各 handler 自己的 catch，测到的就不是那句 401 了。

test('未登录这一档：六个入口同一句话', async () => {
  const app = createApp();
  const paths = [
    ['get', '/api/users/my'],
    ['put', '/api/users/my'],
    ['delete', '/api/users/my'],
    ['post', '/api/upload/avatar'],
    ['post', '/api/deposit/upload-proof'],
    ['post', '/api/payment/create'],
    ['get', '/api/payment/status'],
    ['post', '/api/ratings'],
    ['post', '/api/reports'],
    ['post', '/api/auth/change-password'],
  ];
  for (const [method, p] of paths) {
    const req = request(app)[method](p);
    if (method === 'post') req.set('Content-Type', 'application/json').send({});
    const res = await req;
    assert.strictEqual(res.status, 401, method.toUpperCase() + ' ' + p);
    assert.deepStrictEqual(
      res.body,
      { success: false, message: '未登录' },
      method.toUpperCase() + ' ' + p,
    );
  }
});

test('带了令牌但对不上：换成 token无效（与「没带」分开说）', async () => {
  const app = createApp();
  const forged = 'Bearer ' + FORGED_TOKEN;
  for (const [method, p] of [
    ['put', '/api/users/my'],
    ['get', '/api/payment/status'],
    ['post', '/api/payment/create'],
  ]) {
    const req = request(app)[method](p).set('Authorization', forged);
    if (method === 'post') req.set('Content-Type', 'application/json').send({});
    const res = await req;
    assert.strictEqual(res.status, 401, method.toUpperCase() + ' ' + p);
    assert.strictEqual(res.body.message, 'token无效', method.toUpperCase() + ' ' + p);
  }
});

test('只认 Bearer 这一种写法：Basic、缺空格都不算带了令牌', async () => {
  const app = createApp();
  for (const header of ['Basic dXNlcjpwYXNz', 'Bearer', 'token=' + userToken()]) {
    const res = await request(app).put('/api/users/my').set('Authorization', header);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.message, '未登录', header);
  }
});

test('请先登录这一档：自定义字段、解锁申请、向量族共用一句', async () => {
  const app = createApp();
  const cases = [
    ['get', '/api/users/custom-fields'],
    ['post', '/api/users/custom-fields'],
    ['post', '/api/unlock-contact/submit'],
    ['get', '/api/vector/stats'],
    ['get', '/api/vector/anything'],
  ];
  for (const [method, p] of cases) {
    const req = request(app)[method](p);
    if (method === 'post') req.set('Content-Type', 'application/json').send({});
    const res = await req;
    assert.strictEqual(res.status, 401, method.toUpperCase() + ' ' + p);
    assert.deepStrictEqual(
      res.body,
      { success: false, message: '请先登录' },
      method.toUpperCase() + ' ' + p,
    );
  }
});

test('POST /api/users 匿名：需要登录（这句只属于创建资料那条）', async () => {
  const res = await request(createApp())
    .post('/api/users')
    .set('Content-Type', 'application/json')
    .send({});
  assert.strictEqual(res.status, 401);
  assert.deepStrictEqual(res.body, { success: false, message: '需要登录' });
});

test('管理员闸：匿名与「拿用户令牌冒充」都回同一句 401 需要管理员权限', async () => {
  const app = createApp();
  const paths = [
    ['get', '/api/admin/stats'],
    ['get', '/api/users/pending'],
    ['get', '/api/admin/deposits'],
    ['get', '/api/admin/payment-price'],
    ['put', '/api/admin/payment-price'],
    ['post', '/api/users/batch'],
    ['post', '/api/admin/custom-fields'],
    ['get', '/api/reports'],
  ];
  for (const [method, p] of paths) {
    const anon = request(app)[method](p);
    if (method === 'post' || method === 'put')
      anon.set('Content-Type', 'application/json').send({});
    const a = await anon;
    assert.strictEqual(a.status, 401, '匿名 ' + method.toUpperCase() + ' ' + p);
    assert.deepStrictEqual(a.body, { success: false, message: '需要管理员权限' }, '匿名 ' + p);

    // 用户令牌过不了管理员闸：verifyAdminToken 先判 role，不是 'admin' 直接 null，
    // 连白名单那次查询都不会发出（services/admin.service.js:96）。所以这条不碰库。
    const asUser = request(app)
      [method](p)
      .set('Authorization', 'Bearer ' + userToken());
    if (method === 'post' || method === 'put')
      asUser.set('Content-Type', 'application/json').send({});
    const u = await asUser;
    assert.strictEqual(u.status, 401, '用户令牌 ' + method.toUpperCase() + ' ' + p);
    assert.deepStrictEqual(u.body, { success: false, message: '需要管理员权限' }, '用户令牌 ' + p);
  }
});

test('批量生成向量是唯一的例外：先过登录闸再过管理员闸，两句话不一样', async () => {
  const app = createApp();
  const forged = await request(app)
    .post('/api/vector/batch')
    .set('Authorization', 'Bearer ' + FORGED_TOKEN);
  assert.strictEqual(forged.status, 401, '登录闸在前');
  assert.strictEqual(forged.body.message, '请先登录');

  const asUser = await request(app)
    .post('/api/vector/batch')
    .set('Authorization', 'Bearer ' + userToken())
    .set('Content-Type', 'application/json')
    .send({});
  assert.strictEqual(
    asUser.status,
    403,
    '现量=' + asUser.status + ' ' + JSON.stringify(asUser.body),
  );
  assert.deepStrictEqual(asUser.body, { success: false, message: '仅管理员可批量生成向量' });
});

test('向量三查只认本人：替别人查回 403 那两句', async () => {
  const app = createApp();
  const auth = 'Bearer ' + userToken();
  const gen = await request(app)
    .post('/api/vector/generate/someone-else')
    .set('Authorization', auth);
  assert.strictEqual(gen.status, 403);
  assert.strictEqual(gen.body.message, '只能为自己生成向量');

  for (const p of ['/api/vector/similar/someone-else', '/api/vector/match/someone-else']) {
    const res = await request(app).get(p).set('Authorization', auth);
    assert.strictEqual(res.status, 403, p);
    assert.strictEqual(res.body.message, '只能查看自己的匹配', p);
  }
});

test('评价与举报：闸只判「有没有带 Bearer」，令牌对不对交给 service 那句 400', async () => {
  const app = createApp();
  for (const p of ['/api/ratings', '/api/reports']) {
    const res = await request(app)
      .post(p)
      .set('Authorization', 'Bearer ' + FORGED_TOKEN)
      .set('Content-Type', 'application/json')
      .send({});
    assert.strictEqual(res.status, 400, p);
    assert.deepStrictEqual(res.body, { success: false, message: 'token无效' }, p);
  }
});

test('支付下单的三条 400 各说各的事（都在读体之后、碰库之前）', async () => {
  const app = createApp();
  const auth = 'Bearer ' + userToken();
  const post = (p, body) =>
    request(app)
      .post(p)
      .set('Authorization', auth)
      .set('Content-Type', 'application/json')
      .send(body);

  const noChannel = await post('/api/payment/create', {});
  assert.strictEqual(noChannel.status, 400);
  assert.strictEqual(noChannel.body.message, '缺少参数');

  const badPurpose = await post('/api/payment/create', { channel: 'alipay', purpose: '转账给我' });
  assert.strictEqual(badPurpose.status, 400);
  assert.strictEqual(badPurpose.body.message, '不支持的支付用途');

  const noTarget = await post('/api/payments/view-contact', { channel: 'alipay' });
  assert.strictEqual(noTarget.status, 400);
  assert.strictEqual(noTarget.body.message, '缺少解锁对象');
});

test('mock-pay 是显式开闸的口：没开闸长得跟"没有这个接口"一样，开闸后先认登录', async () => {
  // 这一档必须自己控制环境变量：本机 backend/.env 里 ALLOW_MOCK_PAY=1，
  // CI 和线上都没有这一行，两边读到不同值。判据按两档分别钉住，别跟着盘上的配置走。
  const had = process.env.ALLOW_MOCK_PAY;
  try {
    delete process.env.ALLOW_MOCK_PAY;
    const closed = await request(createApp()).get('/api/payment/mock-pay');
    assert.strictEqual(closed.status, 404, '未开闸要长得像没有这条路由');
    assert.strictEqual(closed.body.message, 'Not Found');

    process.env.ALLOW_MOCK_PAY = '1';
    const opened = await request(createApp()).get('/api/payment/mock-pay');
    assert.strictEqual(opened.status, 401, '开闸后先撞登录闸（顺序照旧：判开闸 → 判登录）');
    assert.strictEqual(opened.body.message, '请先登录');

    const forged = await request(createApp())
      .get('/api/payment/mock-pay')
      .set('Authorization', 'Bearer ' + FORGED_TOKEN);
    assert.strictEqual(forged.status, 401);
    assert.strictEqual(forged.body.message, 'token无效');
  } finally {
    if (had === undefined) delete process.env.ALLOW_MOCK_PAY;
    else process.env.ALLOW_MOCK_PAY = had;
  }
});

test('管理员登录：账号或密码缺失这句话在碰库之前', async () => {
  const app = createApp();
  for (const p of ['/api/admin/login', '/api/admin']) {
    const res = await request(app).post(p).set('Content-Type', 'application/json').send({});
    assert.strictEqual(res.status, 401, p);
    assert.deepStrictEqual(res.body, { success: false, message: '请输入管理员账号和密码' }, p);
  }
});

test('退出登录不需要登录态，且清 cookie 的属性必须和签发时一一对齐', async () => {
  const res = await request(createApp()).post('/api/auth/logout');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { success: true, message: '已退出登录' });
  const cookie = res.headers['set-cookie'].join('; ');
  // 同名 + 同 Path 才删得掉；漏一条属性浏览器就当成另一个作用域的新 cookie，
  // 于是"点了退出、cookie 还在"。这句就是那条坑的锁。
  assert.ok(cookie.includes('auth_token=;'), cookie);
  assert.ok(cookie.includes('Path=/'), cookie);
  assert.ok(cookie.includes('HttpOnly'), cookie);
  assert.ok(cookie.includes('SameSite=Lax'), cookie);
  assert.ok(cookie.includes('Max-Age=0'), cookie);
  assert.ok(cookie.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'), cookie);
  // NODE_ENV=test 不是 production ⇒ 这句不许出现（出现了本机也验不到线上行为，线上那一档由下面的单测锁）
  assert.ok(!cookie.includes('Secure'), cookie);
});

test('cookie 工具单测：解析、签发、清除三件事各自成立', () => {
  assert.deepStrictEqual(parseCookies('a=1; auth_token=xyz ; b=2'), {
    a: '1',
    auth_token: 'xyz',
    b: '2',
  });
  assert.deepStrictEqual(parseCookies(undefined), {});
  assert.deepStrictEqual(parseCookies('novalue'), { novalue: '' });
  assert.strictEqual(getAuthTokenFromCookie({ headers: { cookie: 'auth_token=abc' } }), 'abc');
  assert.strictEqual(getAuthTokenFromCookie({ headers: {} }), null);

  const fakeRes = () => {
    const h = {};
    return { setHeader: (k, v) => (h[k] = v), headers: h };
  };
  const prod = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const s = fakeRes();
    setAuthCookie(s, 'tok');
    const c1 = s.headers['Set-Cookie'];
    assert.ok(
      c1.startsWith('auth_token=tok; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure'),
      c1,
    );
    const e = fakeRes();
    clearAuthCookie(e);
    const c2 = e.headers['Set-Cookie'];
    assert.strictEqual(
      c2,
      'auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure',
    );
  } finally {
    process.env.NODE_ENV = prod;
  }
});

test('cookie 桥接：只在本来没有 Authorization 时补头，显式 Bearer 永远优先', () => {
  const bridged = { headers: { cookie: 'auth_token=from-cookie' } };
  cookieAuthBridge(bridged, {}, () => {});
  assert.strictEqual(bridged.headers.authorization, 'Bearer from-cookie');
  assert.strictEqual(bearerToken(bridged), 'from-cookie');

  const explicit = {
    headers: { cookie: 'auth_token=from-cookie', authorization: 'Bearer from-header' },
  };
  cookieAuthBridge(explicit, {}, () => {});
  assert.strictEqual(bearerToken(explicit), 'from-header');

  const nothing = { headers: { cookie: 'other=1' } };
  cookieAuthBridge(nothing, {}, () => {});
  assert.strictEqual(nothing.headers.authorization, undefined);
});

test('cookie 桥接端到端：带着登录态的 cookie 能过用户闸，但过不了管理员闸', async () => {
  const app = createApp();
  const tok = userToken();

  // ① 只给 cookie：向量族的登录闸（requireToken 吃 Bearer）被桥接喂上 ⇒ 往下走到「只认本人」那句 403
  const viaCookie = await request(app)
    .get('/api/vector/similar/someone-else')
    .set('Cookie', 'auth_token=' + tok);
  assert.strictEqual(
    viaCookie.status,
    403,
    '现量=' + viaCookie.status + ' ' + JSON.stringify(viaCookie.body),
  );
  assert.strictEqual(viaCookie.body.message, '只能查看自己的匹配');

  // ② cookie 过不了管理员闸：还是 403「仅管理员可批量生成向量」而不是放行
  const adminGate = await request(app)
    .post('/api/vector/batch')
    .set('Cookie', 'auth_token=' + tok);
  assert.strictEqual(adminGate.status, 403);
  assert.strictEqual(adminGate.body.message, '仅管理员可批量生成向量');

  // ③ 两边都带时显式 Bearer 赢：Bearer 给一枚废令牌 ⇒ 401，cookie 里那枚好令牌不被采信
  const both = await request(app)
    .get('/api/vector/similar/someone-else')
    .set('Cookie', 'auth_token=' + tok)
    .set('Authorization', 'Bearer ' + FORGED_TOKEN);
  assert.strictEqual(both.status, 401);
  assert.strictEqual(both.body.message, '请先登录');
});
