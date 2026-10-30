// ============================================================
// 中间件 - 请求体解析
//
// 全局只用一个 express.text，而不是 express.json + express.urlencoded 两件套，
// 这是刻意的，两个理由都能在代码里兑现：
// 1) 解析失败的处理必须留在各 handler 自己那个 try/catch 里。旧写法是
//    readBodyWithLimit(req) 拿到字符串、再由 handler 做 JSON.parse，
//    所以「体不是合法 JSON」在 /api/payment/create 回 500、在 /api/auth/login 回 400、
//    在 /api/admin/payment-price 回 400「请求格式错误」——三套措辞和码各自成立。
//    换成 express.json 的话 body-parser 会抢先抛错，这些差异全被抹平成同一个 400。
// 2) 支付宝异步通知要拿**原始** form 串验签，规范里空格编码成 '+'，
//    而 express.urlencoded 会把 '+' 解成空格并重组字段，验签必挂
//    （详见 routes/payment.js 里 decodeFormBody 那段注释）。text 解析原样留着。
//
// multipart 由 multer 在处理它的那条路由上单独收（middleware/upload.js），
// 所以这里的 type 谓词把 multipart 排除掉——两边不能都去读同一条流。
// ============================================================

const express = require('express');
const { MAX_BODY_SIZE, BODY_HARD_LIMIT } = require('../config');

function isMultipart(req) {
  return String(req.headers['content-type'] || '').includes('multipart/form-data');
}

const textBody = express.text({
  type: (req) => !isMultipart(req),
  limit: BODY_HARD_LIMIT,
});

/**
 * 兜住空体口径：express.text 之后统一把 undefined 归成 ''。
 * 单独一条中间件而不是塞进上面的 options，因为 options 里没有这个钩子。
 */
function normalizeEmptyBody(req, res, next) {
  if (req.body === undefined) req.body = '';
  next();
}

/**
 * 单条路由自己的请求体上限复检（挂在 textBody 之后）。
 * 全局上限放到最宽那一档（向量批量 10MB），各入口的实际上限在这里点名，
 * 超了就回它历史上那一句——不是把上限统一成 5MB 然后让日志里多出一堆"看不懂的错误"。
 * @param {number} bytes 这条路由允许的最大字节数
 * @param {{status?: number, message?: string}} options
 */
function bodyLimit(bytes, options = {}) {
  const status = options.status || 413;
  const message = options.message || `请求体过大，最大允许${Math.round(bytes / 1024 / 1024)}MB`;
  return function bodyLimitMiddleware(req, res, next) {
    const raw = typeof req.body === 'string' ? req.body : '';
    if (Buffer.byteLength(raw) > bytes) {
      res.status(status).json({ success: false, message });
      return;
    }
    next();
  };
}

/** 普通 JSON 入口的默认上限，措辞与旧 readBodyWithLimit 一致 */
const defaultBodyLimit = () =>
  bodyLimit(MAX_BODY_SIZE, {
    message: `请求体过大，最大允许${Math.round(MAX_BODY_SIZE / 1024 / 1024)}MB`,
  });

/**
 * 取原始请求体字符串，超过 MAX_BODY_SIZE 就抛出旧 readBodyWithLimit 那一句。
 *
 * 为什么不走上面的 bodyLimit 中间件：支付下单、两条异步通知这三个入口，
 * 旧写法是 handler 内部 `try { await readBodyWithLimit(req) } catch`，
 * 超限和"体不是合法 JSON"落进同一个 catch，回的是各自 handler 那一句
 * （下单 500 + e.message；微信通知 500 {code:'FAIL'}；支付宝通知 200 'fail'）。
 * 中间件抢在 handler 之前回 413，这三处措辞和状态码就全变了。
 * 所以这里只把"旧 readBodyWithLimit 会 reject 的那个 Error"原样造出来，
 * 让 throw 发生在 handler 自己的 try 里面，catch 照旧接管。
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
function textWithinLimit(req) {
  const raw = typeof req.body === 'string' ? req.body : '';
  if (Buffer.byteLength(raw) > MAX_BODY_SIZE) {
    throw new Error(`请求体过大，最大允许${Math.round(MAX_BODY_SIZE / 1024 / 1024)}MB`);
  }
  return raw;
}

module.exports = {
  textBody,
  normalizeEmptyBody,
  bodyLimit,
  defaultBodyLimit,
  isMultipart,
  textWithinLimit,
};
