// ============================================================
// 中间件 - 统一错误出口 + 404
//
// 旧写法是 server.js 整个 handler 外面套一大圈 try/catch，兜底回
// 500 {success:false, message:'服务器内部错误'}。这条中间件就是那一圈的替身：
// async 处理器抛出来的错由 middleware/async-handler.js 交回 next，在这里收尾。
// ============================================================

const { MAX_BODY_SIZE } = require('../config');

/**
 * 404：措辞与 Content-Type 都按现量保持——是 text/plain 的 "Not Found"，
 * 不是 JSON。前端和监控里都有按这条判"接口不存在"的，改成 JSON 会把它们带偏。
 */
function notFound(req, res) {
  res.status(404).type('text/plain; charset=utf-8').send('Not Found');
}

/**
 * 统一错误出口。签名必须是四个参数，Express 才认它是错误中间件。
 * 只在这一处决定"没被 handler 自己接住的错长什么样"，各路由不再各写一遍。
 */
// 四个参数里 req 用不到，但 no-unused-vars 配了 args:'after-used'——
// 后面的 next 用了，前面的就不该报，所以这里不需要 eslint-disable。
function errorHandler(err, req, res, next) {
  // 请求体超过全局上限：body-parser 抢在 handler 之前拒收，这里把它折算成
  // 旧 readBodyWithLimit 那一句，别让排查的人看到 "request entity too large" 这种看不懂的话
  if (err && err.type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      message: `请求体过大，最大允许${Math.round(MAX_BODY_SIZE / 1024 / 1024)}MB`,
    });
    return;
  }

  console.error('[Server] uncaught error:', err);

  if (res.headersSent) {
    // 头已经发出去了（比如流式响应中途出错），只能交给 Express 默认收尾
    next(err);
    return;
  }

  res.status(500).json({ success: false, message: '服务器内部错误' });
}

module.exports = { notFound, errorHandler };
