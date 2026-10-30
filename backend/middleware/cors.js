// ============================================================
// 中间件 - 跨源（CORS）
//
// 也没用 cors 包：这个包的 Vary 追加时机、preflight 默认状态码这类默认行为
// 与本站现量的响应头不完全一致，而头是要逐条对基线的。这里就二十行，
// 每一行都能对着旧 server.js 读懂，比配一串 option 更好维护。
// ============================================================

const { ALLOWED_ORIGINS } = require('../config');

function cors(req, res, next) {
  const origin = req.headers.origin || '';
  // 命中白名单才发跨源头。以前 Allow-Credentials: true 是无条件发的，
  // 而 Origin 在不匹配时留空串——头看着像配好了，实际浏览器照样拦，
  // 排错时谁都会以为"CORS 通了"。不匹配就一个跨源头都不留，让失败一眼可见。
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '';

  // Vary: Origin 常驻：同一 URL 的响应会随请求的 Origin 不同而不同，
  // 不加这句，中间的缓存（Caddy/浏览器）可能把 A 源的响应喂给 B 源
  res.setHeader('Vary', 'Origin');

  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-None-Match');
    // 跨源时浏览器默认不把 ETag 交给 JS，前端拿不到就退化成 Date.now() 当版本号、协商缓存永不命中。
    res.setHeader('Access-Control-Expose-Headers', 'ETag');
  }

  // 预检：命中白名单时上面五个头已经发出去了，这里只收尾
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  next();
}

module.exports = { cors };
