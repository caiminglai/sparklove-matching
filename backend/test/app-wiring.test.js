// ============================================================
// 应用装配测试：四个改变框架默认的开关 + 中间件顺序 + 全局响应头
//
// 这一族断言钉的是 app.js 那几行"看起来无害、删掉就改契约"的设置。
// 现量来源：改前/改后各跑一遍的 126 条契约基线（站2产生临时文件/baseline-old.json），
// 以及本次重写时逐条量过的 Express 默认行为。
// ============================================================
require('./helpers/env');

const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');

const { createApp } = require('../app');

const NOPE = '/api/__definitely_not_a_real_endpoint__';

test('app.js 那四个开关的取值都还在（少一个就是契约漂移）', () => {
  const app = createApp();
  assert.strictEqual(
    app.get('x-powered-by'),
    false,
    'X-Powered-By 必须 disable：旧写法从来不发框架名',
  );
  assert.strictEqual(
    app.get('trust proxy'),
    1,
    'trust proxy 必须是 1：线上是 Caddy 反代，限流按 req.ip 计数',
  );
  assert.strictEqual(
    app.get('query parser'),
    'simple',
    'query parser 必须是 simple：重复键折成数组、不认嵌套',
  );
  assert.strictEqual(
    app.get('strict routing'),
    true,
    'strict routing 必须开：/api/users 与 /api/users/ 是两条',
  );
  assert.strictEqual(app.get('etag'), false, 'etag 必须关：旧的 JSON 响应没有 W/"..." 这个头');
});

test('中间件顺序＝安全头 → 日志 → cookie 桥接 → CORS → 请求体 → 兜底', () => {
  // 头两层（query / expressInit）是 Express 自己的，不算本站的顺序账
  const names = createApp()
    ._router.stack.map((l) => l.handle.name)
    .slice(2);
  assert.deepStrictEqual(names.slice(0, 6), [
    'securityHeaders',
    'requestLogger',
    'cookieAuthBridge',
    'cors',
    'textParser', // express.text 解析出来的中间件就叫这个名
    'normalizeEmptyBody',
  ]);
  // 最后两层必须是兜底 404 再兜底 500：顺序反过来，404 会被错误出口当成 500 发出去
  assert.deepStrictEqual(names.slice(-2), ['notFound', 'errorHandler']);
});

test('任何响应都带六个安全头，且不暴露框架名', async () => {
  const res = await request(createApp()).get(NOPE);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(
    res.headers['x-frame-options'],
    'DENY',
    '现量是 DENY，helmet 默认会发成 SAMEORIGIN',
  );
  assert.strictEqual(res.headers['x-xss-protection'], '1; mode=block');
  assert.strictEqual(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.strictEqual(res.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()');
  assert.strictEqual(res.headers['cross-origin-opener-policy'], 'same-origin');
  assert.strictEqual(res.headers['x-powered-by'], undefined);
});

test('兜底 404 是 text/plain 的 Not Found，不是 JSON，也不带 ETag', async () => {
  const res = await request(createApp()).get(NOPE);
  assert.strictEqual(res.headers['content-type'], 'text/plain; charset=utf-8');
  assert.strictEqual(res.text, 'Not Found');
  assert.strictEqual(res.headers.etag, undefined, 'etag 关掉之后不许凭空冒出一个 W/"..."');
  assert.ok(res.headers['x-request-id'], '每条响应都要有请求号，日志和响应才能对上');
});

test('200 的响应也没有 ETag（预检是最便宜的一条 200）', async () => {
  const res = await request(createApp())
    .options('/api/auth/login')
    .set('Origin', 'http://localhost:4000');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.etag, undefined);
});

test('query parser 设成 simple 之后，重复键给数组、点号不拆对象', async () => {
  // 这条不是"测 Express"，是测本站那个设置值到底改变了什么：
  // searchUsers 是 {...req.query} 直接灌进查询条件的，口径一换就能多拆出没人预期的键。
  function echo(parser) {
    const app = express();
    app.set('query parser', parser);
    app.get('/e', (req, res) => res.json(req.query));
    return app;
  }
  const simple = await request(echo('simple')).get('/e?a=1&a=2&b[c]=3');
  assert.deepStrictEqual(simple.body, { a: ['1', '2'], 'b[c]': '3' });
  const extended = await request(echo('extended')).get('/e?a=1&a=2&b[c]=3');
  assert.deepStrictEqual(
    extended.body,
    { a: ['1', '2'], b: { c: '3' } },
    '对照组：qs 口径会把点号拆成对象',
  );
});

test('白名单源：预检回五个跨源头 + Vary: Origin', async () => {
  const res = await request(createApp())
    .options('/api/auth/login')
    .set('Origin', 'http://localhost:4000');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:4000');
  assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
  assert.strictEqual(
    res.headers['access-control-allow-methods'],
    'GET, POST, DELETE, PUT, OPTIONS',
  );
  assert.strictEqual(
    res.headers['access-control-allow-headers'],
    'Content-Type, Authorization, If-None-Match',
  );
  assert.strictEqual(
    res.headers['access-control-expose-headers'],
    'ETag',
    '不发这条，前端拿不到 ETag 就退化成时间戳',
  );
  assert.strictEqual(res.headers.vary, 'Origin');
});

test('陌生源：一个跨源头都不留，只留 Vary: Origin', async () => {
  const res = await request(createApp())
    .options('/api/auth/login')
    .set('Origin', 'http://evil.example.com');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
  assert.strictEqual(
    res.headers['access-control-allow-credentials'],
    undefined,
    '旧写法无条件发 true，是假象',
  );
  assert.strictEqual(res.headers.vary, 'Origin');
});

test('陌生源也一样：普通请求的 404 响应不带跨源头', async () => {
  const res = await request(createApp()).get(NOPE).set('Origin', 'http://evil.example.com');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
});

test('FRONTEND_URL 里的逗号串能命中白名单（旧写法整串比较，从来没匹配上过）', async () => {
  const res = await request(createApp())
    .options('/api/auth/login')
    .set('Origin', 'http://localhost:4001');
  assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:4001');
});
