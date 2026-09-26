/**
 * 取访客真实 IP（原生 http 模块版）
 *
 * 线上是 Caddy 反代 → 本服务。Caddy 会把直连它的那个地址**追加**到
 * X-Forwarded-For 末尾，所以**最后一项**才是访客自己伪造不了的；
 * 之前四处都把整串头当键用，自带一条 X-Forwarded-For 就能换一份额度，
 * 登录/注册限流形同虚设。
 */

/**
 * @param {import('http').IncomingMessage} req
 * @returns {string} 用于限流与日志的客户端地址
 */
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const hops = String(xff)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  const real = req.headers['x-real-ip'];
  if (real) return String(real).trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = { clientIp };
