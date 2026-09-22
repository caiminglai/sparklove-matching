// 站2 前端运行时：零第三方依赖的「静态资源服务 + 反向代理」
// 作用：以根路径 "/" 提供构建好的 React dist（含支付二维码等静态资源），
//       并把 /api、/uploads、/avatars、/admin（后端自己发的管理后台页面）反代到后端容器，实现同源访问、免 CORS。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST_DIR = path.resolve(process.env.DIST_DIR || '/app/dist');
const BACKEND_URL = process.env.BACKEND_URL || 'http://jzxr:8080';
const PORT = parseInt(process.env.PORT || '80', 10);
const HOST = process.env.HOST || '0.0.0.0';

const backend = new URL(BACKEND_URL);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
};

const PROXY_PREFIXES = ['/api/', '/uploads/', '/avatars/', '/admin/'];

function isProxy(pathname) {
  return PROXY_PREFIXES.some((p) => pathname === p.slice(0, -1) || pathname.startsWith(p));
}

function proxyRequest(req, res) {
  const upstream = http.request(
    {
      protocol: backend.protocol,
      hostname: backend.hostname,
      port: backend.port || (backend.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: backend.host },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res, { end: true });
    }
  );
  upstream.on('error', (err) => {
    console.error('[前端代理] 上游错误:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end('502 Bad Gateway');
  });
  req.pipe(upstream, { end: true });
}

function serveIndex(res) {
  fs.readFile(path.join(DIST_DIR, 'index.html'), (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('前端未构建或 index.html 缺失');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

function serveNotFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}

function serveStatic(res, urlPath) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(DIST_DIR, safePath);
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) {
    return serveIndex(res);
  }
  fs.stat(filePath, (err, stat) => {
    if (err) {
      // 带扩展名却没找到文件 = 真的不存在，必须回 404。
      // 否则微信业务域名校验文件（WW_verify_xxx.txt）缺失时会被 index.html 顶替成 200，平台侧误判校验通过。
      if (/\.[a-zA-Z0-9]{1,8}$/.test(urlPath)) return serveNotFound(res);
      return serveIndex(res); // SPA 前端路由回退到 index.html
    }
    if (stat.isDirectory()) {
      return serveStatic(res, path.posix.join(urlPath, 'index.html'));
    }
    const ext = path.extname(filePath).toLowerCase();
    const isAsset = filePath.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('400 Bad Request');
  }

  if (isProxy(pathname)) return proxyRequest(req, res);
  if (pathname === '/') return serveStatic(res, '/index.html');
  return serveStatic(res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`[前端] 静态服务已启用: http://${HOST}:${PORT} -> dist=${DIST_DIR}, 后端=${BACKEND_URL}`);
});
