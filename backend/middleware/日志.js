/**
 * 日志中间件 - 适用于原生 http 模块
 * 提供请求日志记录功能
 */

const { clientIp: getClientIp } = require('../utils/clientIp');

/**
 * 根据 HTTP 状态码返回日志级别
 * @param {number} statusCode
 * @returns {string}
 */
function getLogLevel(statusCode) {
  if (statusCode >= 500) return 'ERROR';
  if (statusCode >= 400) return 'WARN';
  if (statusCode >= 300) return 'REDIRECT';
  return 'INFO';
}

/**
 * 日志里不许出现口令和真人资料内容。
 * req.url 是带查询串的原始地址，而搜索/审核接口的关键字就写在查询串里：
 * 管理员在后台按手机号搜人 → /api/users/search?contact=13800001111，
 * 这行原样进日志等于把真人手机号抄进了服务器日志文件（docker logs 还会被备份走）。
 * 只掩值不掩键：键名留着，排查时还看得出「这次搜的是 contact」
 */
const SENSITIVE_QUERY_KEYS = new Set([
  'contact', 'phone', 'password', 'oldpassword', 'newpassword',
  'name', 'keyword', 'token', 'code', 'smscode', 'captcha'
]);

function redactUrl(rawUrl) {
  const text = String(rawUrl || '');
  const at = text.indexOf('?');
  if (at < 0) return text;
  const path = text.slice(0, at);
  const redacted = text.slice(at + 1).split('&').map(pair => {
    const eq = pair.indexOf('=');
    if (eq < 0) return pair;
    const key = pair.slice(0, eq).toLowerCase();
    return SENSITIVE_QUERY_KEYS.has(key) ? key + '=***' : pair;
  }).join('&');
  return path + '?' + redacted;
}

/**
 * 请求日志记录 - 在请求处理的最开始调用
 * 会生成请求ID、monkey-patch res 以跟踪响应大小、在请求结束时输出日志
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
function requestLogger(req, res) {
  // 生成请求 ID
  const reqId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  req.requestId = reqId;
  res.setHeader('X-Request-Id', reqId);

  // 跟踪响应大小（monkey-patch res.write 和 res.end）
  let responseSize = 0;
  const originalWrite = res.write;
  const originalEnd = res.end;

  res.write = function (chunk, ...args) {
    if (chunk) {
      responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    }
    return originalWrite.call(res, chunk, ...args);
  };

  res.end = function (chunk, ...args) {
    if (chunk) {
      responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    }
    return originalEnd.call(res, chunk, ...args);
  };

  // 记录开始时间
  const startTime = Date.now();

  // 在响应完成时记录日志
  res.on('finish', () => {
    const elapsed = Date.now() - startTime;
    const level = getLogLevel(res.statusCode);
    const ip = getClientIp(req);
    const time = new Date().toISOString();

    console.log(
      `[${time}] [${level}] ${reqId} ${req.method} ${redactUrl(req.url)} → ${res.statusCode} ${elapsed}ms ${responseSize}B ${ip}`
    );
  });
}

module.exports = {
  requestLogger,
  redactUrl
};
