// ============================================================
// 磁盘文件下发 + 后台页面（routes/files.js 与 routes/pages.js）
//
// 这一族的断言全对着改前基线那 12 条静态/页面用例写，因为"不对齐"是逐条记过账的：
// 三条 404 的措辞和头各不相同，四条页面路由必须早于 /admin/* 那条静态兜底。
//
// ⚠ 路径口径：routes/files.js 用的是 path.resolve(__dirname,'..','..','uploads')，
//   它的 __dirname 是 backend/routes ⇒ 本站仓库根的 uploads/（不是 backend/uploads/）；
//   容器里同一句解析成 /，正好落在 compose 挂进来的 /uploads 卷上。
//   测试这一族必须按同一句算，不然写进去的文件读不到（10-30 就这么假失败过一次）。
// ============================================================
require('./helpers/env');

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { createApp } = require('../app');

const SITE_PUBLIC = path.resolve(__dirname, '..', '..', 'app', 'public');
const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', 'uploads');
const AVATARS_DIR = path.join(UPLOADS_ROOT, 'avatars');
const TMP_PNG = '__qoder_probe__.png';
// 1x1 的合法 PNG：routes/files.js 的 IMAGE_MIME 认它，魔数也是真的
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

before(() => {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
  fs.writeFileSync(path.join(AVATARS_DIR, TMP_PNG), PNG_BYTES);
});
// 只删自己写进去的那一个文件。uploads/ 整目录在 .gitignore 第 30 行，留着不影响仓库，
// 也不能删——线上跑起来它就是要用的目录。
after(() => fs.rmSync(path.join(AVATARS_DIR, TMP_PNG), { force: true }));

test('收款码：图在场回 200 image/png，缺图回 404 File Not Found 且一个 Content-Type 都不发', async () => {
  // 两种都是基线现量：本机与 CI 的仓里有这两张图（.gitignore 为它们开了 ! 例外），
  // 而镜像只 COPY backend/，容器里直连这两条就是 404（改前改后一样，不是本轮引入的）。
  for (const p of ['/wechat-qr.png', '/alipay-qr.png']) {
    const onDisk = fs.existsSync(path.join(SITE_PUBLIC, p.slice(1)));
    const res = await request(createApp()).get(p);
    if (onDisk) {
      assert.strictEqual(res.status, 200, p);
      assert.strictEqual(res.headers['content-type'], 'image/png', p);
    } else {
      assert.strictEqual(res.status, 404, p);
      assert.strictEqual(res.text, 'File Not Found', p);
      assert.strictEqual(
        res.headers['content-type'],
        undefined,
        p + '：旧写法 writeHead 没给这个头',
      );
    }
  }
});

test('头像缺文件：404 File Not Found，同样不带 Content-Type', async () => {
  const res = await request(createApp()).get('/avatars/nope-not-here.png');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.text, 'File Not Found');
  assert.strictEqual(res.headers['content-type'], undefined);
});

test('/uploads 缺文件：Not Found 且 Content-Type 逐字是 text/plain（没有 charset）', async () => {
  // 这条是本轮唯一必须由 plain404 出面的地方：
  // res.type()/res.set() 会给 text/* 补 "; charset=utf-8"，res.send() 更会改成 text/html，
  // 只有原生 setHeader 能保住基线里那一个头的值。
  const res = await request(createApp()).get('/uploads/nope-not-here.png');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.text, 'Not Found');
  assert.strictEqual(res.headers['content-type'], 'text/plain');
});

test('指到目录不再打崩进程：/uploads/ 与 /uploads/avatars 都按"没有这个文件"回 404', async () => {
  // 旧写法这里是 fs.createReadStream(目录).pipe(res) ⇒ EISDIR 掉进 uncaughtException
  // ⇒ process.exit(1)：任何人 GET 一次就能让后端进程退出。
  const app = createApp();
  for (const p of ['/uploads/', '/uploads/avatars', '/uploads/avatars/']) {
    const res = await request(app).get(p);
    assert.strictEqual(res.status, 404, p);
    assert.strictEqual(res.headers['content-type'], 'text/plain', p);
  }
  // 崩没崩，问后面这条就知道：进程还在就会正常回 401
  const after401 = await request(app).get('/api/admin/deposits');
  assert.strictEqual(after401.status, 401);
});

test('裸 /uploads 不带斜杠是另一条路径：压根没匹配上，走兜底 404（带 charset）', async () => {
  // strict routing 开着，/uploads 不等于 /uploads/；这里钉的就是"两种写法各自的结果"
  const res = await request(createApp()).get('/uploads');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.headers['content-type'], 'text/plain; charset=utf-8');
  assert.strictEqual(res.text, 'Not Found');
});

test('真的能下发头像：/avatars/<文件> 与 /uploads/avatars/<文件> 都回 200 image/png', async () => {
  const app = createApp();
  const a = await request(app).get('/avatars/' + TMP_PNG);
  assert.strictEqual(a.status, 200);
  assert.strictEqual(a.headers['content-type'], 'image/png');
  assert.ok(Buffer.isBuffer(a.body) && a.body.equals(PNG_BYTES), '字节要原样，不能被改写');

  const b = await request(app).get('/uploads/avatars/' + TMP_PNG);
  assert.strictEqual(b.status, 200);
  assert.strictEqual(b.headers['content-type'], 'image/png');
});

test('穿越写法拿不到目录外的文件（基线里那条的现量是 404）', async () => {
  const app = createApp();
  for (const p of [
    '/avatars/../../backend/server.js',
    '/uploads/../../backend/server.js',
    '/uploads/%2e%2e%2f%2e%2e%2fserver.js',
    '/avatars/%00' + TMP_PNG,
  ]) {
    const res = await request(app).get(p);
    assert.notStrictEqual(res.status, 200, p);
    assert.ok(!String(res.text).includes('createApp'), p + '：把源码发出去了');
  }
});

test('后台四页都回 200 的 HTML，标题按页各不相同', async () => {
  const app = createApp();
  const expect = {
    '/admin': '管理后台 - 精准匹配',
    '/admin/m': '精准匹配 - 管理后台',
    '/admin/m-login': '登录 - 精准匹配',
    '/admin/main': '精准匹配 - 数据管理',
  };
  for (const [p, title] of Object.entries(expect)) {
    const res = await request(app).get(p);
    assert.strictEqual(res.status, 200, p);
    assert.strictEqual(res.headers['content-type'], 'text/html; charset=utf-8', p);
    assert.ok(res.text.includes('<title>' + title + '</title>'), p + ' 的标题不对');
  }
});

test('这四页一律不挂管理员闸：地址栏跳转本来就没有 Bearer', async () => {
  const res = await request(createApp()).get('/admin/m');
  assert.strictEqual(res.status, 200, '这里判了 checkAdminAuth 的话，登录后跳后台就成了登录页');
  assert.ok(!res.text.includes('<title>登录 - 精准匹配</title>'));
});

test('带尾斜杠也一样命中（旧写法是并列写了两遍，不是靠框架折行）', async () => {
  const app = createApp();
  for (const p of ['/admin/', '/admin/m/', '/admin/m-login/', '/admin/main/']) {
    const res = await request(app).get(p);
    assert.strictEqual(res.status, 200, p);
  }
});

test('后台目录下的静态文件读不到：Not Found 且没有 Content-Type', async () => {
  const res = await request(createApp()).get('/admin/nope-not-here.css');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.text, 'Not Found');
  assert.strictEqual(
    res.headers['content-type'],
    undefined,
    'res.send 会补 text/html，所以这里必须用 end()',
  );
});

test('后台目录里真有的文件带 Cache-Control: no-cache 与 charset', async () => {
  const res = await request(createApp()).get('/admin/login.html');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['cache-control'], 'no-cache');
  assert.strictEqual(res.headers['content-type'], 'text/html; charset=utf-8');
});
