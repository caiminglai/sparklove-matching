// ============================================================
// 中间件 - HTTP 安全响应头
//
// 这一份刻意没用 helmet：helmet 默认会把 X-Frame-Options 发成 SAMEORIGIN
// （本站现量是 DENY）、Referrer-Policy 发成 no-referrer（现量是
// strict-origin-when-cross-origin）、不再发 X-XSS-Protection，还会带一条
// Content-Security-Policy——而后台那四页（admin/*.html）全是内联脚本，
// CSP 一上就白屏（站3 那边也是靠 helmet({contentSecurityPolicy:false}) 关掉的）。
// 头是对外契约的一部分，本轮只搬水管不改水压；要换 helmet 得单独一轮，
// 逐条把差异列出来再定。
// ============================================================

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  // Express 自带 X-Powered-By: Express，app.disable('x-powered-by') 是主闸，
  // 这句留着当第二道：万一有人把那句删了，这里照样不把框架名暴露出去
  res.removeHeader('X-Powered-By');

  next();
}

module.exports = { securityHeaders };
