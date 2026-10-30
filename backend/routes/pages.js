// ============================================================
// 路由 - 后台 HTML 页面与后台目录下的静态文件
//
// 这一族原来整段内联在 server.js（旧 L220-258）。搬出来有两个理由：
// server.js 是入口，不该同时是页面分发器；而且这几条路由的判据顺序有讲究——
// 四条"无扩展名"的页面路由必须早于 /admin/* 那条静态兜底，
// 不然 /admin/m-login 会被 path.basename 切成一个不带 .html 的文件名、读不到文件回 404。
//
// ⚠ 这几条页面路由一律不挂管理员闸，是决定不是漏：
//   后台那几页的数据接口只认 Authorization: Bearer（防 CSRF），而浏览器地址栏跳转
//   带不上这个头。若在这里判 checkAdminAuth，现量是「登录后跳 /admin/m 回的是
//   <title>登录 - 精准匹配</title>，手机后台永远进不去」；隔壁 /admin/main 不判反倒正常。
//   页面自己会查 localStorage 里的 token 再决定跳不跳登录页，服务端这道判据既做不到、
//   又挡住了正路。
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router({ strict: true }); // strict：尾斜杠不当同一条，理由见 routes/index.js 头部

const ADMIN_DIR = path.join(__dirname, '..', 'admin');

// 模块加载期读盘，与旧写法一致（旧 server.js:26-29）：
// 少一个文件就让进程起不来，比"点开某个后台页才发现 500"好发现，也好定位。
const PAGES = {
  login: fs.readFileSync(path.join(ADMIN_DIR, 'login.html'), 'utf8'),
  main: fs.readFileSync(path.join(ADMIN_DIR, 'main.html'), 'utf8'),
  mLogin: fs.readFileSync(path.join(ADMIN_DIR, 'm-login.html'), 'utf8'),
  m: fs.readFileSync(path.join(ADMIN_DIR, 'm.html'), 'utf8'),
};

const HTML_TYPE = 'text/html; charset=utf-8';

// 后台静态资源（css/js/图片）的 mime 表，沿用旧那一份
const STATIC_MIME = {
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.html': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

function serveHtml(html) {
  // 用 end() 而不是 send()：send 会给字符串补一条 text/html 的 Content-Type，
  // 这里要的是和旧 writeHead 逐字一致的响应头
  return function sendPage(req, res) {
    res.status(200).set('Content-Type', HTML_TYPE).end(html);
  };
}

// 旧写法是 pathname === '/admin' || pathname === '/admin/'，两条并列；
// 本站开了 strict routing，两种写法就得各自列出来
router.get(['/admin', '/admin/'], serveHtml(PAGES.login));
router.get(['/admin/m', '/admin/m/'], serveHtml(PAGES.m));
router.get(['/admin/m-login', '/admin/m-login/'], serveHtml(PAGES.mLogin));
router.get(['/admin/main', '/admin/main/'], serveHtml(PAGES.main));

// 后台目录下的静态文件（css/js/图片）
router.get('/admin/*', (req, res) => {
  const filePath = path.join(ADMIN_DIR, path.basename(req.path));
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // 旧这里是 res.writeHead(404); res.end('Not Found')——不带 Content-Type。
      // Express 的 send() 会补 text/html，所以这里同样用 end() 保持"这条头不存在"
      res.status(404).end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res
      .status(200)
      .set({
        'Content-Type': (STATIC_MIME[ext] || 'application/octet-stream') + '; charset=utf-8',
        'Content-Length': data.length,
        'Cache-Control': 'no-cache',
      })
      .end(data);
  });
});

module.exports = { pagesRouter: router, PAGES, ADMIN_DIR };
