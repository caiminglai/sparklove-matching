/**
 * 日志中间件 - 适用于原生 http 模块
 * 提供请求日志记录功能
 */

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
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
    const time = new Date().toISOString();

    console.log(
      `[${time}] [${level}] ${reqId} ${req.method} ${req.url} → ${res.statusCode} ${elapsed}ms ${responseSize}B ${ip}`
    );
  });
}

module.exports = {
  requestLogger
};
