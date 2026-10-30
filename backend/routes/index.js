// ============================================================
// 路由装配表——整个后端的接口都在这里排一次队
//
// ⚠ 顺序是承重的，不要按字母重排。
// 旧 server.js 是一长串 if 从上往下命中即返回，"谁在前"直接决定重叠路径归谁。
// Express 的 router 也是自上而下，所以那一份次序原样搬过来。真正会打起来的有三处：
//   1) /api/users/custom-fields 必须早于 /api/users/:id——不然 "custom-fields"
//      会被当成一条资料 id 去走 PUT/DELETE /api/users/:id。
//   2) /api/users/my 必须早于 /api/users/:id，同一回事。
//   3) /api/vector/* 那道闸（在 routes/vector.js 里）必须整体排在支付、认证之前，
//      和旧 server.js:284 那个 handleVectorRequest 的位置对齐。
// 其余各 router 之间路径不重叠，排在哪儿都一样；这里仍按旧的行序摆，
// 是为了让"改造前后逐行对照"这件事还做得动。
//
// ⚠ 每个 router 都是 express.Router({ strict: true }) 建的，这一句是承重的：
//   旧写法是 pathname === '/api/users' 那种精确串比较，所以 '/api/users/'（带尾斜杠）
//   在旧现量里落到最后一行、回 404 "Not Found"。
//   app.js 里那句 app.set('strict routing', true) 只管 app 自己的那台路由器，
//   子路由器拿的是自己构造时的参数——现量（本机 Express 4.22.3）：
//     app 级 set 之后 app.get('/api/users') → '/api/users/' 回 404 ✅
//     express.Router() 默认           → '/api/users/' 回 200 ❌（等于凭空多服务一条路径）
//     express.Router({strict:true})   → '/api/users/' 回 404 ✅
//   所以判据必须在建路由器的那一刻写明，不能只靠 app.js 那一行。
//   旧代码里确实并列写了 '/admin' 与 '/admin/' 两种的，那四条在 routes/pages.js
//   里也是两条一起注册，不受这条影响。
// ============================================================

const { pagesRouter } = require('./pages.js');
const { filesRouter } = require('./files.js');
const uploadRouter = require('./upload.js');
const depositsRouter = require('./deposits.js');
const vectorRouter = require('./vector.js');
const contactUnlockRouter = require('./contact-unlock.js');
const paymentRouter = require('./payment.js');
const authRouter = require('./auth.js');
const customFieldsRouter = require('./custom-fields.js');
const usersRouter = require('./users.js');
const ratingsRouter = require('./ratings.js');
const reportsRouter = require('./reports.js');
const { fieldMappingsRouter } = require('./field-mappings.js');

// 静态文件与页面（收款码 / 头像 / uploads / 后台 HTML）。
// 两者路径不相交，谁在前都一样；这里按旧 server.js 的行序摆：
// 收款码(旧 L181) → 头像(L195) → 后台页(L219) → uploads(L310，与后台页交错，此处归并)
const STATIC_ROUTERS = [filesRouter, pagesRouter];

// 接口。数组顺序＝命中顺序，改动请在提交说明里写清为什么换。
const API_ROUTERS = [
  uploadRouter, // /api/upload/avatar、/api/deposit/upload-proof
  depositsRouter, // /api/admin/deposits*、/api/users/my-deposit
  vectorRouter, // /api/vector/*
  contactUnlockRouter, // /api/unlock-contact/*、后台审核与手动解锁
  paymentRouter, // /api/payment/*、/api/payments/*、价格设置
  authRouter, // /api/auth/*、/api/admin/login
  customFieldsRouter, // /api/custom-fields、/api/(admin|users)/custom-fields*
  usersRouter, // /api/users*、/api/circles/members、/api/admin/stats
  ratingsRouter, // /api/ratings、/api/users/:id/ratings
  reportsRouter, // /api/reports*
  fieldMappingsRouter, // /api/field-mappings*（自带 ETag 协商缓存）
];

/**
 * 把全部路由按既有次序挂上 app。
 * @param {import('express').Express} app
 */
function registerRoutes(app) {
  for (const router of STATIC_ROUTERS) app.use(router);
  for (const router of API_ROUTERS) app.use(router);
}

module.exports = { registerRoutes, STATIC_ROUTERS, API_ROUTERS };
