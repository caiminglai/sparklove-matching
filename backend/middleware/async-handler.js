// ============================================================
// 中间件 - async 处理器包装
//
// Express 不会自动等 promise：async 路由里抛出来的错若没人接，就掉成
// unhandledRejection，客户端那条请求一直挂到超时（旧写法是靠 server.js 外面
// 那一整圈 try/catch 兜住的）。每个 handler 过一遍这里，reject 就交回 next，
// 由 middleware/error-handler.js 统一收尾。
// ============================================================

/** 把一个 async 处理器包成 Express 认识的 (req,res,next) */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
