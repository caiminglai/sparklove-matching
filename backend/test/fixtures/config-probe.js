// ============================================================
// 子进程探针：把 config/index.js 在指定环境变量下求值一遍，回 JSON
//
// 为什么走子进程：config 在**模块加载那一刻**读 env（第 19 行的 dotenv 路径、
// 下面每个常量都取当时的值），同进程里改 process.env 再 require 拿不到新值，
// 而 require 缓存会把第一次的结果留给后面所有测试。
// 所以每一档 env 都开一个新进程，值全由调用方显式给——
// 本机 backend/.env 里有的那些键（FRONTEND_URL、ADMIN_PASSWORD 等）一律传空串压住，
// 免得这份测试读到他机器上的配置。
// ============================================================
const path = require('path');

// 清掉 host 上 .env 可能带进来的默认，只保留调用方通过 env 显式给的
for (const key of [
  'SERVER_ORIGIN',
  'FRONTEND_URL',
  'MAX_BODY_SIZE',
  'MAX_UPLOAD_SIZE',
  'MAX_VECTOR_BODY',
  'BODY_HARD_LIMIT',
  'PORT',
]) {
  if (process.env[key] === undefined) process.env[key] = '';
}

const config = require(path.join(__dirname, '..', '..', 'config'));

// 前缀是必要的：dotenv v17 在 require 那一刻就往 stdout 打一行横幅
// （"injected env (18) from ..."，提示语里还带花括号），整段 stdout 不是合法 JSON。
process.stdout.write(
  'CONFIG_JSON:' +
    JSON.stringify({
      envFile: config.ENV_FILE,
      allowedOrigins: config.ALLOWED_ORIGINS,
      serverOrigin: config.SERVER_ORIGIN,
      maxBodySize: config.MAX_BODY_SIZE,
      maxUploadSize: config.MAX_UPLOAD_SIZE,
      maxVectorBody: config.MAX_VECTOR_BODY,
      bodyHardLimit: config.BODY_HARD_LIMIT,
      port: config.PORT,
      isProduction: config.isProduction(),
    }),
);
