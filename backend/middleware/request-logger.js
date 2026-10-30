// ============================================================
// 中间件 - 请求日志
//
// 日志里不许出现口令和真人资料内容：req.url 带查询串，而搜索/审核接口的关键字
// 就写在查询串里（管理员按手机号搜人 → /api/users/search?contact=13800001111），
// 原样进日志等于把真人手机号抄进服务器日志文件（docker logs 还会被备份走）。
// 所以只掩值不掩键：键名留着，排查时还看得出「这次搜的是 contact」。
// ============================================================

// 认 IP 走 req.ip：app.set('trust proxy', 1) 之后它就是 X-Forwarded-For 的最后一跳，
// 也就是 Caddy 追加的那个直连地址——访客自己伪造不了。
// 这与被删掉的 utils/clientIp.js 那条"取最后一跳"的规则同口径，也和站1、站3 一致。
const SENSITIVE_QUERY_KEYS = new Set([
  'contact',
  'phone',
  'password',
  'oldpassword',
  'newpassword',
  'name',
  'keyword',
  'token',
  'code',
  'smscode',
  'captcha',
]);

function getLogLevel(statusCode) {
  if (statusCode >= 500) return 'ERROR';
  if (statusCode >= 400) return 'WARN';
  if (statusCode >= 300) return 'REDIRECT';
  return 'INFO';
}

function redactUrl(rawUrl) {
  const text = String(rawUrl || '');
  const at = text.indexOf('?');
  if (at < 0) return text;
  const path = text.slice(0, at);
  const redacted = text
    .slice(at + 1)
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq < 0) return pair;
      const key = pair.slice(0, eq).toLowerCase();
      return SENSITIVE_QUERY_KEYS.has(key) ? key + '=***' : pair;
    })
    .join('&');
  return path + '?' + redacted;
}

function requestLogger(req, res, next) {
  const reqId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  req.requestId = reqId;
  res.setHeader('X-Request-Id', reqId);

  // 跟踪响应大小：包一层 write/end，把真实写出的字节数攒起来
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

  const startTime = Date.now();

  res.on('finish', () => {
    const elapsed = Date.now() - startTime;
    const level = getLogLevel(res.statusCode);
    const time = new Date().toISOString();

    console.log(
      `[${time}] [${level}] ${reqId} ${req.method} ${redactUrl(req.originalUrl)} → ${res.statusCode} ${elapsed}ms ${responseSize}B ${req.ip}`,
    );
  });

  next();
}

module.exports = { requestLogger, redactUrl, getLogLevel, SENSITIVE_QUERY_KEYS };
