/**
 * 安全中间件 - 适用于原生 http 模块
 * 提供安全头设置和基础安全防护
 */

/**
 * 设置安全相关的响应头
 * @param {import('http').ServerResponse} res
 */
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  // 移除 X-Powered-By（如果存在）
  res.removeHeader('X-Powered-By');
}

/**
 * 主安全函数 - 在请求处理的最开始调用
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
function applySecurity(req, res) {
  securityHeaders(res);
}

module.exports = {
  applySecurity
};
