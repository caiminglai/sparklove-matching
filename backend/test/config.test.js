// ============================================================
// 配置层：env 怎么被读成常量
//
// 每档都开一个新进程跑 test/fixtures/config-probe.js（理由写在那份探针的头上：
// config 在模块加载那一刻取值，同进程改 env 再 require 拿不到新值）。
// 本机 backend/.env 里真实存在的那些键一律显式传空串压住，
// 所以这份测试在他机器、我机器、CI 上量出来的数是一样的。
// ============================================================
require('./helpers/env');

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');

const PROBE = path.join(__dirname, 'fixtures', 'config-probe.js');

// 这些键由调用方给值；不给就是"设了但为空"（config 里 filter(Boolean) 那条路），
// 绝不留 undefined——留了就会被本机 backend/.env 里那一行填上真实值。
const KEYS = [
  'SERVER_ORIGIN',
  'FRONTEND_URL',
  'MAX_BODY_SIZE',
  'MAX_UPLOAD_SIZE',
  'MAX_VECTOR_BODY',
  'BODY_HARD_LIMIT',
  'PORT',
];

function readConfig(extraEnv = {}) {
  const env = { ...process.env };
  for (const k of KEYS) env[k] = '';
  delete env.NODE_ENV;
  Object.assign(env, extraEnv);
  const out = execFileSync(process.execPath, [PROBE], { env, encoding: 'utf8' });
  const m = out.match(/CONFIG_JSON:(\{.*\})/);
  assert.ok(m, '探针没回 JSON：' + out.slice(0, 200));
  return JSON.parse(m[1]);
}

test('默认档：三个硬编码来源 + SERVER_ORIGIN 兜底，白名单不去重（只被 includes 用）', () => {
  const c = readConfig();
  assert.deepStrictEqual(c.allowedOrigins, [
    'http://localhost:4000',
    'http://localhost:4001',
    'http://localhost:8080',
    'http://localhost:8080',
  ]);
  assert.strictEqual(c.serverOrigin, 'http://localhost:8080');
  assert.strictEqual(c.port, 8080);
  assert.strictEqual(c.isProduction, false);
});

test('FRONTEND_URL 按逗号拆开：compose 里那种一串写法终于能匹配上', () => {
  // 以前整串塞进数组，而 Origin 头永远是单个 URL ⇒ 这一项从来没生效过
  const one = readConfig({ FRONTEND_URL: 'http://localhost:4001' });
  assert.ok(
    one.allowedOrigins.includes('http://localhost:4001'),
    JSON.stringify(one.allowedOrigins),
  );

  const many = readConfig({ FRONTEND_URL: 'http://a.com,http://b.com' });
  assert.deepStrictEqual(
    many.allowedOrigins.slice(-2),
    ['http://a.com', 'http://b.com'],
    JSON.stringify(many.allowedOrigins),
  );

  // 带空格与空项的写法（人在 compose 里手敲最容易这样）：逐项 trim、空项丢掉
  const messy = readConfig({ FRONTEND_URL: ' http://a.com , http://b.com ,, ' });
  assert.deepStrictEqual(
    messy.allowedOrigins.slice(-2),
    ['http://a.com', 'http://b.com'],
    JSON.stringify(messy.allowedOrigins),
  );

  // 空串等于没配
  const none = readConfig({ FRONTEND_URL: '' });
  assert.strictEqual(none.allowedOrigins.length, 4, JSON.stringify(none.allowedOrigins));
});

test('NODE_ENV 决定读哪份 .env：这是 compose 里那句 environment 承重的原因', () => {
  assert.strictEqual(readConfig({ NODE_ENV: 'test' }).envFile, '.env');
  assert.strictEqual(readConfig({ NODE_ENV: 'development' }).envFile, '.env');
  assert.strictEqual(readConfig({ NODE_ENV: '' }).envFile, '.env');
  const prod = readConfig({ NODE_ENV: 'production' });
  assert.strictEqual(prod.envFile, '.env.production');
  assert.strictEqual(prod.isProduction, true);
});

test('脏数字一律回落默认档：0、负数、非数字都不许把上限配没', () => {
  const c = readConfig({
    MAX_BODY_SIZE: '0',
    MAX_UPLOAD_SIZE: '-1',
    MAX_VECTOR_BODY: 'abc',
    PORT: '0',
  });
  assert.strictEqual(c.maxBodySize, 5 * 1024 * 1024);
  assert.strictEqual(c.maxUploadSize, 5 * 1024 * 1024);
  assert.strictEqual(c.maxVectorBody, 10 * 1024 * 1024);
  assert.strictEqual(c.port, 8080);
});

test('正经数字照收：后台/容器真要改上限走的就是这一条路', () => {
  const c = readConfig({ MAX_BODY_SIZE: '1048576', MAX_VECTOR_BODY: '2097152', PORT: '9099' });
  assert.strictEqual(c.maxBodySize, 1048576);
  assert.strictEqual(c.maxVectorBody, 2097152);
  assert.strictEqual(c.port, 9099);
  // BODY_HARD_LIMIT 没配 ⇒ 跟着最宽路由的 2 倍走
  assert.strictEqual(c.bodyHardLimit, 2097152 * 2);
});

test('全局闸配小到不如最宽路由时按无效处理：宁可忽略这个值，不让契约静默漂移', () => {
  const c = readConfig({ BODY_HARD_LIMIT: '1024' });
  assert.strictEqual(c.bodyHardLimit, 10 * 1024 * 1024 * 2, '现量=' + c.bodyHardLimit);
  // 比最宽路由大的值仍然照收
  const ok = readConfig({ BODY_HARD_LIMIT: String(30 * 1024 * 1024) });
  assert.strictEqual(ok.bodyHardLimit, 30 * 1024 * 1024);
});
