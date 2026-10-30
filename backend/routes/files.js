// ============================================================
// 路由 - 磁盘文件下发（收款码 / 头像 / 上传目录）
//
// 三条都是"公开可读的磁盘文件"，但历史响应并不完全一致，这里逐条对齐、不合并：
//   /wechat-qr.png、/alipay-qr.png → 404 时回 'File Not Found' 且不带 Content-Type
//   /avatars/<文件>              → 路径不合法回 400 'Invalid path'，读不到回 'File Not Found'
//   /uploads/<子目录>/<文件>      → 越界回 403 'Forbidden'，读不到回 404 'Not Found'（text/plain，无 charset）
// 这些差别是前端和监控已经吃下去的现状，统一它们要单独一轮，不在本轮顺手改。
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router({ strict: true }); // strict：尾斜杠不当同一条，理由见 routes/index.js 头部

const SITE_PUBLIC = path.resolve(__dirname, '..', '..', 'app', 'public');
const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', 'uploads');
const AVATARS_DIR = path.resolve(UPLOADS_ROOT, 'avatars');

const QR_FILES = { '/wechat-qr.png': 'wechat-qr.png', '/alipay-qr.png': 'alipay-qr.png' };

const IMAGE_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

// /uploads 那条 404 的写法要绕开 Express 的两个默认动作，所以单独包一层：
// 旧这里是 writeHead(404, {'Content-Type':'text/plain'}) + end('Not Found')，
// 头的值逐字就是 "text/plain"、没有 charset 后缀。
// 而 res.type('text/plain') / res.set('Content-Type', ...) 内部走 res.type，
// 会给 text/* 自动补 "; charset=utf-8"（现量见交付报告：旧 'text/plain' → 新 'text/plain; charset=utf-8'）；
// 换成 res.send('Not Found') 更糟，它会把类型改成 text/html。
// setHeader 是 Node 原生方法，Express 不插手，头才能保持那一个值。
function plain404(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Not Found');
}

// ---------- 收款二维码：仓根 app/public 下那两张 ----------
for (const [routePath, fileName] of Object.entries(QR_FILES)) {
  router.get(routePath, (req, res) => {
    fs.readFile(path.join(SITE_PUBLIC, fileName), (err, data) => {
      if (err) {
        res.status(404).end('File Not Found');
        return;
      }
      res.status(200).set('Content-Type', 'image/png').end(data);
    });
  });
}

// ---------- 头像：uploads/avatars 下的图，带目录穿越防护 ----------
router.get('/avatars/*', (req, res) => {
  const fileName = req.path.replace('/avatars/', '');
  // 修复口径保留：不要用 fileName.includes('..') 那种判断——它会误伤 avatar..png
  // 这种合法文件名。规范化之后看它还在不在 avatars 目录里，才是对的判据。
  const filePath = path.resolve(AVATARS_DIR, fileName);
  if (!filePath.startsWith(AVATARS_DIR + path.sep) || fileName.includes('\0')) {
    res.status(400).end('Invalid path');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.status(404).end('File Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res
      .status(200)
      .set('Content-Type', IMAGE_MIME[ext] || 'image/jpeg')
      .end(data);
  });
});

// ---------- 上传目录：/uploads/<子目录>/<文件>，凭证与头像原件都在这 ----------
router.get('/uploads/*', (req, res) => {
  const relativePath = req.path.replace(/^\/uploads\//, '');
  const resolvedPath = path.resolve(path.join(UPLOADS_ROOT, relativePath));

  if (!resolvedPath.startsWith(UPLOADS_ROOT + path.sep) && resolvedPath !== UPLOADS_ROOT) {
    res.status(403).type('text/plain; charset=utf-8').end('Forbidden');
    return;
  }

  // 🔴 这条判断是补的 bug 修，不是顺手加的防御：
  // /uploads/ 和 /uploads/avatars 这种"指到目录"的 URL，旧写法会走到
  // fs.createReadStream(目录).pipe(res)——读目录必抛 EISDIR，而这条 error 没有监听器，
  // 于是掉进 process.on('uncaughtException')，那个监听器 closeDb() 后 process.exit(1)。
  // 也就是说：任何人 GET 一次 /uploads/ 就能让这个后端进程退出（compose 里 restart 还会把它拉起来，
  // 但这是一条零成本的打断通道）。现在目录一律按"没有这个文件"处理，流也补了 error 收尾。
  let stat;
  try {
    stat = fs.statSync(resolvedPath);
  } catch {
    plain404(res);
    return;
  }
  if (!stat.isFile()) {
    plain404(res);
    return;
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  res.status(200).set('Content-Type', IMAGE_MIME[ext] || 'application/octet-stream');

  const stream = fs.createReadStream(resolvedPath);
  stream.on('error', (err) => {
    console.error('[uploads] 读文件中断:', err.code || err.message);
    stream.destroy();
    if (!res.headersSent) plain404(res);
    else res.end();
  });
  stream.pipe(res);
});

module.exports = { filesRouter: router, UPLOADS_ROOT, AVATARS_DIR, SITE_PUBLIC };
