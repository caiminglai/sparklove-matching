// ============================================================
// HTTP 层用到的工具函数（不碰库、不碰网络的纯判据）
//
// 这一族是"改完还剩在手边"的那几块：上传格式校验、请求体日志消毒、
// 查询参数口径、公开路径→盘上路径。每一条都对应一个具体的坑，
// 注释里写清是哪个坑，回归时才知道这句话为什么不能改。
// ============================================================
require('./helpers/env');

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  validateMagicBytes,
  validateExtension,
  ALLOWED_IMAGE_EXTENSIONS,
} = require('../utils/file-validation');
const { buildUploadName, deleteUploadedFile } = require('../utils/uploadedFiles');
const { searchParam } = require('../utils/searchParam');
const { extractId } = require('../utils/extractId');
const { redactUrl, getLogLevel, SENSITIVE_QUERY_KEYS } = require('../middleware/request-logger');

// 上传根目录与 routes/files.js 同一处算法：backend/utils/../.. = 仓库根，容器里才是 /uploads
const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', 'uploads');
const PROBE = path.join(UPLOADS_ROOT, 'avatars', '__qoder_delete_probe__.png');
const PROBE_URL = '/uploads/avatars/__qoder_delete_probe__.png';

test('收尾：本轮建的探针文件一个都不留（放在 after 钩子里，中途断言失败也清）', () => {
  assert.ok(PROBE.includes('__qoder_'), '探针文件名必须带 __qoder_ 标记，免得误碰真图');
});
test.after(() => {
  if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE);
});

test('魔术数字：内容得对得上它自称的那一种（/uploads/* 匿名可下，光看扩展名等于随便改个名）', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const gif = Buffer.from([0x47, 0x49, 0x46, 0x38]);
  const webp = Buffer.from('RIFFxxxxWEBP', 'latin1');
  assert.strictEqual(validateMagicBytes(png, '.png'), true);
  assert.strictEqual(validateMagicBytes(jpg, '.jpg'), true);
  assert.strictEqual(validateMagicBytes(jpg, '.jpeg'), true);
  assert.strictEqual(validateMagicBytes(gif, '.gif'), true);
  assert.strictEqual(validateMagicBytes(webp, '.webp'), true);

  // 把脚本改名成 .png 传上来
  assert.strictEqual(validateMagicBytes(Buffer.from('<html>'), '.png'), false);
  assert.strictEqual(validateMagicBytes(Buffer.from('MZ'), '.jpg'), false);
  // 体不够长不能算通过（短文件不能靠"前缀没对上"蒙）
  assert.strictEqual(validateMagicBytes(Buffer.from([0x89, 0x50]), '.png'), false);
  assert.strictEqual(validateMagicBytes(png, undefined), false);
  assert.strictEqual(validateMagicBytes(png, '.exe'), false);
  // 扩展名大小写不敏感
  assert.strictEqual(validateMagicBytes(png, '.PNG'), true);
});

test('扩展名白名单：只放五种图，没扩展名的一律拒', () => {
  assert.deepStrictEqual(ALLOWED_IMAGE_EXTENSIONS, ['.png', '.jpg', '.jpeg', '.gif', '.webp']);
  assert.deepStrictEqual(validateExtension('a.PNG'), { ext: '.png', valid: true });
  assert.deepStrictEqual(validateExtension('a.jpeg'), { ext: '.jpeg', valid: true });
  assert.deepStrictEqual(validateExtension('a.php'), { ext: '.php', valid: false });
  assert.deepStrictEqual(validateExtension('evil.png.html'), { ext: '.html', valid: false });
  assert.deepStrictEqual(validateExtension('noext'), { ext: '', valid: false });
  assert.deepStrictEqual(validateExtension(''), { ext: '', valid: false });
  assert.deepStrictEqual(validateExtension(undefined), { ext: '', valid: false });
});

test('上传命名：前缀_毫秒_随机后缀，同前缀连撞两次也不会覆盖同一张', () => {
  const a = buildUploadName('avatar', '.png');
  const b = buildUploadName('avatar', '.png');
  assert.match(a, /^avatar_\d+_[a-z0-9]{1,6}\.png$/, a);
  assert.notStrictEqual(a, b, '只带时间戳的名字能被枚举（改几个数字就是别人的凭证图）');
  assert.match(buildUploadName('report', '.jpg'), /^report_\d+_[a-z0-9]{1,6}\.jpg$/);
});

test('删记录必须连文件一起删，而盘上路径只能在 uploads 根下', () => {
  // 越界写法一律 false（这些路径活库里真出现过：contact_unlocks 有 3 行不带前导斜杠）
  assert.strictEqual(deleteUploadedFile('/etc/passwd'), false);
  assert.strictEqual(deleteUploadedFile(''), false);
  assert.strictEqual(deleteUploadedFile(null), false);
  assert.strictEqual(deleteUploadedFile('/uploads'), false, '根目录本身不许删');
  assert.strictEqual(deleteUploadedFile('/uploads/../package.json'), false, '穿越出根目录要拦住');
  assert.strictEqual(deleteUploadedFile('/avatars/x.png'), false, 'avatars 不是 uploads 下那条');
  assert.strictEqual(
    deleteUploadedFile('/uploads/avatars/压根不存在.png'),
    false,
    '不在盘上不能报"删掉了"',
  );

  fs.mkdirSync(path.dirname(PROBE), { recursive: true });
  fs.writeFileSync(PROBE, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  assert.strictEqual(fs.existsSync(PROBE), true);
  // 不带前导斜杠的写法也认（库里两种都存过）
  assert.strictEqual(deleteUploadedFile('uploads/avatars/__qoder_delete_probe__.png'), true);
  assert.strictEqual(fs.existsSync(PROBE), false);
  assert.strictEqual(deleteUploadedFile(PROBE_URL), false, '第二次删同一张要老实说没删着');
});

test('searchParam：重复键取第一个值，这是 URLSearchParams 口径，不能顺手换成 req.query', () => {
  const req = { originalUrl: '/api/vector/similar/u1?type=profile&limit=5&limit=9&flag' };
  assert.strictEqual(searchParam(req, 'type'), 'profile');
  assert.strictEqual(
    searchParam(req, 'limit'),
    '5',
    'simple 解析器会把它读成 ["5","9"]，那两条接口历史只取第一个',
  );
  assert.strictEqual(searchParam(req, 'flag'), '');
  assert.strictEqual(searchParam(req, 'nope'), null);
  const bare = { originalUrl: '/api/reports' };
  assert.strictEqual(searchParam(bare, 'status'), null);
});

test('extractId：取前缀后紧挨着的那一段，没有就回 null', () => {
  assert.strictEqual(extractId('/api/users/abc123', 'users'), 'abc123');
  assert.strictEqual(extractId('/api/reports/42', 'reports'), '42');
  assert.strictEqual(extractId('/api/users', 'users'), null);
  assert.strictEqual(extractId('/api/users/', 'users'), null);
  assert.strictEqual(extractId('/api/users/x/ratings', 'users'), 'x');
  assert.strictEqual(extractId('/api/orders/7', 'users'), null, '前缀不在路径里就不该瞎取');
});

test('日志消毒：手机号这类值不许抄进服务器日志，键名留着方便排查', () => {
  assert.strictEqual(
    redactUrl('/api/users/search?contact=13800001111&limit=10'),
    '/api/users/search?contact=***&limit=10',
  );
  // 键名比较走小写：?Phone=1 同样掩掉（代价是掩出来的键名被写成小写，日志里看得懂）
  assert.strictEqual(redactUrl('/api/x?Phone=1'), '/api/x?phone=***');
  assert.strictEqual(redactUrl('/api/x?token='), '/api/x?token=***');
  assert.strictEqual(redactUrl('/api/x?flag'), '/api/x?flag', '没有 = 的裸键不动');
  assert.strictEqual(redactUrl('/api/x'), '/api/x', '没有查询串原样返回');
  assert.strictEqual(redactUrl(''), '');
  assert.strictEqual(redactUrl(undefined), '');
  assert.strictEqual(redactUrl(null), '');
  // 这条集合是判据本身：新增敏感查询键要在这里点名
  for (const k of ['contact', 'phone', 'password', 'token', 'code', 'keyword', 'name']) {
    assert.ok(SENSITIVE_QUERY_KEYS.has(k), '少了这个键：' + k);
  }
});

test('日志级别按状态码分档：4xx 是 WARN、5xx 是 ERROR', () => {
  assert.strictEqual(getLogLevel(200), 'INFO');
  assert.strictEqual(getLogLevel(299), 'INFO');
  assert.strictEqual(getLogLevel(301), 'REDIRECT');
  assert.strictEqual(getLogLevel(302), 'REDIRECT');
  assert.strictEqual(getLogLevel(400), 'WARN');
  assert.strictEqual(getLogLevel(404), 'WARN');
  assert.strictEqual(getLogLevel(429), 'WARN');
  assert.strictEqual(getLogLevel(500), 'ERROR');
  assert.strictEqual(getLogLevel(503), 'ERROR');
});
