// ============================================================
// 路由命中与装配顺序（routes/index.js + app.js 的 strict routing）
//
// 这一族最值钱的三条：
//   1) /api/users/ 带尾斜杠必须 404 —— 每个子路由器都要自己写 express.Router({strict:true})，
//      app.set('strict routing') 只管 app 那一级（10-30 现量的 A/B/D 矩阵见 routes/index.js 头部）。
//   2) /api/users/custom-fields 与 /api/users/my 的 401 措辞不同 ——
//      这两条一旦排到 /api/users/:id 后面，措辞会换、行为会跟着变成"把 custom-fields 当成资料 id"。
//   3) /api/vector（不带斜杠）压根不吃那道登录闸 —— 用 router.use('/api/vector') 会把它变成 401。
// ============================================================
require('./helpers/env');

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { createApp } = require('../app');
const { API_ROUTERS, STATIC_ROUTERS } = require('../routes/index.js');
const { userToken } = require('./helpers/tokens');

const uploadRouter = require('../routes/upload.js');
const depositsRouter = require('../routes/deposits.js');
const vectorRouter = require('../routes/vector.js');
const paymentRouter = require('../routes/payment.js');
const authRouter = require('../routes/auth.js');
const customFieldsRouter = require('../routes/custom-fields.js');
const usersRouter = require('../routes/users.js');

test('装配表的相对顺序钉住（改动要有理由，理由写进提交说明）', () => {
  const at = (m) => API_ROUTERS.indexOf(m);
  assert.ok(at(vectorRouter) < at(paymentRouter), '/api/vector/* 那道闸要排在支付之前');
  assert.ok(at(vectorRouter) < at(authRouter), '也排在认证之前');
  assert.ok(at(customFieldsRouter) < at(usersRouter), 'custom-fields 必须早于 /api/users/:id');
  assert.ok(
    at(uploadRouter) < at(depositsRouter),
    'upload 排在 deposits 之前（旧 server.js 行序）',
  );
  assert.strictEqual(STATIC_ROUTERS.length, 2, '静态两族：files 与 pages');
});

test('每个子路由器都开了 strict：带尾斜杠的接口路径一律 404', async () => {
  const app = createApp();
  for (const p of [
    '/api/users/',
    '/api/custom-fields/',
    '/api/ratings/',
    '/api/reports/',
    '/api/payment/config/',
  ]) {
    const res = await request(app).get(p);
    assert.strictEqual(res.status, 404, p + ' 不该被当成同一条');
    assert.strictEqual(res.text, 'Not Found', p);
  }
});

test('不带斜杠的对应写法照旧命中（404 不是因为整条路由没了）', async () => {
  const app = createApp();
  // 挑 /api/auth/captcha 做对照：滑块图是内存里现画的，不碰库，CI 也绿
  const hit = await request(app).get('/api/auth/captcha');
  assert.strictEqual(hit.status, 200, '现量=' + hit.status + ' ' + JSON.stringify(hit.body));
  assert.strictEqual(hit.body.success, true);
  assert.strictEqual(hit.body.data.width, 300);
  const slash = await request(app).get('/api/auth/captcha/');
  assert.strictEqual(slash.status, 404);
});

test('/api/vector 不带斜杠不吃登录闸：直接 404，和旧写法一样', async () => {
  const res = await request(createApp()).get('/api/vector');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.text, 'Not Found');
});

test('/api/vector/ 与更深一层都先过登录闸：401 请先登录', async () => {
  const app = createApp();
  // 这道闸挂在 router.use 上、按前缀判，跟方法与后面有没有这条子路由都无关，
  // 所以全部用 GET 打一遍即可（旧写法就是这个顺序：先认登录，再找子路径）
  for (const p of [
    '/api/vector/',
    '/api/vector/nope',
    '/api/vector/stats',
    '/api/vector/similar/x',
    '/api/vector/match/x',
    '/api/vector/generate/x',
    '/api/vector/batch',
  ]) {
    const res = await request(app).get(p);
    assert.strictEqual(res.status, 401, p);
    assert.deepStrictEqual(res.body, { success: false, message: '请先登录' }, p);
  }
});

test('两条资料子路径各说各的话：custom-fields 归 custom-fields 管', async () => {
  const app = createApp();
  const cf = await request(app).get('/api/users/custom-fields');
  assert.strictEqual(cf.status, 401);
  assert.strictEqual(cf.body.message, '请先登录', '这条措辞出自 custom-fields/向量那族');

  const mine = await request(app).put('/api/users/my');
  assert.strictEqual(mine.status, 401);
  assert.strictEqual(mine.body.message, '未登录', '这条措辞出自 users 那一族');
});

test('方法不对就是 404，不是 405（旧写法是 if 链命中即返回）', async () => {
  const app = createApp();
  const cases = [
    ['put', '/api/auth/login'],
    ['patch', '/api/users'],
    ['get', '/api/admin/login'],
    ['delete', '/api/payment/config'],
  ];
  for (const [method, p] of cases) {
    const res = await request(app)[method](p);
    assert.strictEqual(res.status, 404, method.toUpperCase() + ' ' + p);
    assert.strictEqual(res.text, 'Not Found', method.toUpperCase() + ' ' + p);
  }
});

test('自定义字段那条 _all 路由：白名单外的方法回 405 + 那句不支持', async () => {
  const app = createApp();
  // 这条 handler 是"先鉴权 → 再按方法分支 → 都不命中回 405"，
  // 所以匿名打过来先撞上第 119 行那句 401 请先登录，带一个合法用户 token 才走得到 405。
  // 405 之前不碰库（GET/POST/DELETE 三个分支都不命中就直接返回），CI 无库也能跑。
  const res = await request(app)
    .patch('/api/users/custom-fields/somekey')
    .set('Authorization', 'Bearer ' + userToken());
  assert.strictEqual(res.status, 405, '现量=' + res.status + ' ' + JSON.stringify(res.body));
  assert.deepStrictEqual(res.body, { success: false, message: '不支持的请求方法' });
});

test('路由表里的路径与旧写法逐条对齐（新增/删除都要在这一笔里说明）', () => {
  const paths = [];
  for (const router of [...STATIC_ROUTERS, ...API_ROUTERS]) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      for (const m of Object.keys(layer.route.methods)) {
        paths.push(
          m.toUpperCase() +
            ' ' +
            (Array.isArray(layer.route.path) ? layer.route.path[0] : layer.route.path),
        );
      }
    }
  }
  // 数法：13 个 router（2 静态 + 11 接口）的 stack 里，每条 route 层按它注册的方法各算一个入口；
  // router.all(...) 只算 1 个（Express 把 all 记成单个 key），数组路径只取第 0 条写进名字，所以数组里
  // 的第二条正则不会另外计数。10-30 现量 = 76。
  // 数字变了就是接口增减，必须同步 126 条契约基线与 docs/API接口文档.md，不是改这个数字就完事。
  assert.strictEqual(paths.length, 76, '入口总数变了：' + paths.length);
  for (const must of [
    'GET /admin',
    'GET /avatars/*',
    'POST /api/upload/avatar',
    'POST /api/vector/batch',
    'POST /api/auth/captcha/verify',
    'GET /api/field-mappings',
    'PUT /api/admin/payment-price',
  ]) {
    assert.ok(paths.includes(must), '少了这条：' + must);
  }
});
