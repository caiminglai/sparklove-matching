// ============================================================
// 应用装配（Express）
//
// 本文件只负责"把中间件按正确顺序挂上、把路由装上"，不 listen、不连库。
// 拆成 createApp() 而不是直接 require 出一个装好的 app，是为了让测试能
// 用 supertest 起一个不占端口的实例（一个进程里跑多份也不打架）。
//
// ⚠ 中间件顺序就是旧 server.js 从上往下那几行，动之前先读完这段理由：
//   securityHeaders → requestLogger → cookieAuthBridge → cors → 请求体解析 → 路由。
//   - 安全头在最前：旧写法是进 handler 第一件事就调完，任何一条响应（含 404、
//     预检、超限）都带着那六个头。放到路由后面就会出现"404 没有安全头"这种新行为。
//   - 日志在桥接之前：旧 requestLogger 拿到的是**原始** Authorization，
//     桥接会把 cookie 里的 token 补成 Bearer；顺序反过来，日志里"有没有带令牌"
//     这一列就变成"浏览器有没有 cookie"，排查登录态时会被误导。
//   - cors 在请求体解析之前：预检请求（OPTIONS）历史上从不读体，
//     而且不带 Content-Length；让 body-parser 抢在前面读它，只是白占内存。
// ============================================================

const express = require('express');

const { securityHeaders } = require('./middleware/security');
const { requestLogger } = require('./middleware/request-logger');
const { cookieAuthBridge } = require('./middleware/auth');
const { cors } = require('./middleware/cors');
const { textBody, normalizeEmptyBody } = require('./middleware/body');
const { notFound, errorHandler } = require('./middleware/error-handler');
const { registerRoutes } = require('./routes/index.js');

function createApp() {
  const app = express();

  // ---- 四个改变框架默认行为的开关，每一个都对着旧现量 ----
  // 旧写法不发 X-Powered-By，Express 默认发
  app.disable('x-powered-by');
  // 线上是 Caddy 反代到本容器。旧 utils/clientIp.js 取的是 x-forwarded-for 的**最后一项**
  // （Caddy 追加的那个直连地址，访客自己伪造不了），10-30 现量：`git show HEAD:backend/utils/clientIp.js`
  // 里那句 `return hops[hops.length - 1]`。trust proxy 取 1 就是同一个位置，口径没换。
  // 不声明 trust proxy，req.ip 会恒等于容器网络地址，限流就变成"全场共用一个额度"。
  // 取 1（只信最靠近本站的那一跳）而不是 true：写成 true 等于接受任何人伪造的 XFF。
  app.set('trust proxy', 1);
  // 旧的是 url.parse(req.url, true).query —— 那是 querystring 口径：同一个键出现两次给数组，
  // 不认识 a[b]=c 这种嵌套写法。Express 默认用 qs，会把重复键折成数组、把点号当路径拆对象。
  // 而 searchUsers 是直接 {...req.query} 灌进查询条件的，口径一换就能多拆出没人预期的键。
  app.set('query parser', 'simple');
  // 旧写法是 pathname === '/api/admin' 这种精确串比较，'/api/admin/' 是另一条路由。
  // Express 默认把结尾斜杠当成同一条，'strict routing' 才保留这个区分。
  // ⚠ 光这一行不够：它只作用于 app 自己的路由器，各 routes/*.js 里的子路由器
  //   必须各自 express.Router({ strict: true })，现量与理由见 routes/index.js 头部。
  app.set('strict routing', true);
  // 旧 JSON 响应没有 ETag（只有 /api/field-mappings* 那两条手写了一个版本串）。
  // Express 的 res.send 会给 200 的响应补一个 W/"..." 弱标，前端那套 ETag 版本号
  // 逻辑（拿不到就退化成 Date.now()）不该被一个凭空冒出来的头改变行为，这里全局关掉。
  // 手写的那条不受影响：res.send 只在"当前没有 ETag 头且允许生成"时才插手。
  app.set('etag', false);

  app.use(securityHeaders);
  app.use(requestLogger);
  app.use(cookieAuthBridge);
  app.use(cors);
  app.use(textBody);
  app.use(normalizeEmptyBody);

  registerRoutes(app);

  // 兜底两条：谁都没接住的请求 → 旧那句 text/plain 的 "Not Found"；
  // 谁都没接住的异常 → 旧那圈 try/catch 的 500 {success:false, message:'服务器内部错误'}
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
