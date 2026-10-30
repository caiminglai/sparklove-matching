// ============================================================
// 测试前置 —— 每个测试文件的第一行都要 require 它，而且必须早于 require('../app')
//
// 两件事：
//   1) 钉住 NODE_ENV。config/index.js 用 NODE_ENV 决定读哪份 .env（'production' 才读
//      .env.production），本机有 backend/.env 就用真的，CI 上没有 .env（.gitignore 第 10 行
//      把它挡了）——两条路都往回落到 db/index.js 里的 DEV_TOKEN_SECRET_FALLBACK，
//      测试自己造令牌、自己校验，用哪个密钥都能对上，所以不依赖 .env 存在。
//      必须在这里设、而不是在 package.json 的 script 里设，是因为 dotenv 只填 process.env
//      里没有的键：谁先 require config，谁的 env 就赢。
//   2) 静音请求日志。middleware/request-logger.js 每个响应打一行，几十条用例会
//      把 TAP 输出淹掉；console.warn/error 不动，真出错照样看得见
//      （errorHandler 里那条 console.error 就是靠它）。
// ============================================================

process.env.NODE_ENV = 'test';
console.log = () => {};
