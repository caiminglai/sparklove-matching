/**
 * 统一 JSON 响应工具
 * 替代各 route 文件顶部重复定义的 sendJson
 */

/**
 * 向 HTTP 响应写入 JSON
 * @param {import('http').ServerResponse} res 响应对象
 * @param {number} statusCode HTTP 状态码
 * @param {object} obj 要序列化的对象
 */
function sendJson(res, statusCode, obj) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

module.exports = { sendJson };
