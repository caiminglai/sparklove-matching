// ============================================================
// 配置层 - 环境变量与全站常量的唯一出处
//
// 加载顺序是承重的：dotenv 必须在本文件被 require 的那一刻就跑完，
// 因为下面这些常量（以及 payment 的 initConfig）都在模块加载期取值，
// 谁先 require 谁就拿不到 env。server.js / app.js 的第一行都是本文件，
// 这条顺序就锁住了。
// ============================================================

const path = require('path');

// ⚠ NODE_ENV 决定读哪份 .env，这一句是本站最容易踩的坑，原样保留：
//   线上 Dockerfile 里 ENV NODE_ENV=production，但 compose 给 jzxr 显式注入了
//   NODE_ENV=development（compose/docker-compose.yml:74），而 compose 只把
//   backend/.env 只读挂到容器 /app/.env——镜像里没有 .env.production。
//   所以那句 environment 是承重的：把它删掉，容器就会改读 .env.production、
//   读不到文件、所有密钥变空，支付与登录一起哑。改这里之前先看 compose 那段。
const ENV_FILE = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
require('dotenv').config({ path: path.join(__dirname, '..', ENV_FILE) });

// ---------- 请求体与上传大小 ----------
// 原先这四个常量散在 utils/config.js 里，与 middleware 各写各的上限，收到这里一处。
const toInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_BODY_SIZE = toInt(process.env.MAX_BODY_SIZE, 5 * 1024 * 1024); // 普通 JSON 体 5MB
const MAX_UPLOAD_SIZE = toInt(process.env.MAX_UPLOAD_SIZE, 5 * 1024 * 1024); // 上传文件 5MB
const MAX_VECTOR_BODY = toInt(process.env.MAX_VECTOR_BODY, 10 * 1024 * 1024); // 向量批量 10MB
// 全局请求体闸：只负责挡内存，不负责说话。
// 它必须比最宽的那条路由上限（向量批量 10MB）再高一档，否则「谁先拒收」就换人了——
// body-parser 抢在路由自己的复检之前抛 entity.too.large，那条接口历史上回的状态码和文案
// （比如批量生成向量超 10MB 时回 500「请求体过大」）就再也复现不出来。
// 各入口的实际上限与措辞一律由 middleware/body.js 的 bodyLimit() 在那条路由上说。
const BODY_HARD_LIMIT_CONFIGURED = toInt(process.env.BODY_HARD_LIMIT, MAX_VECTOR_BODY * 2);
// 显式配到"不比最宽那条路由大"时按无效配置处理：抬回默认档并留一行警告。
// 这个值配小的后果不是报错，是接口契约静默漂移（谁先拒换了人），事后在日志里根本找不回是哪一行 env 造成的。
const BODY_HARD_LIMIT =
  BODY_HARD_LIMIT_CONFIGURED > MAX_VECTOR_BODY ? BODY_HARD_LIMIT_CONFIGURED : MAX_VECTOR_BODY * 2;
if (BODY_HARD_LIMIT !== BODY_HARD_LIMIT_CONFIGURED) {
  console.warn(
    `[config] BODY_HARD_LIMIT=${BODY_HARD_LIMIT_CONFIGURED} 不大于 MAX_VECTOR_BODY=${MAX_VECTOR_BODY}，已改用 ${BODY_HARD_LIMIT}`,
  );
}

// ---------- 端口与来源白名单 ----------
const PORT = toInt(process.env.PORT, 8080);
const SERVER_ORIGIN = process.env.SERVER_ORIGIN || 'http://localhost:8080';

// compose 里 FRONTEND_URL 写的是逗号分隔的一串（现量：容器内 printenv 回
// "http://localhost:4000,http://localhost:4001"）。以前直接把这个整串塞进白名单数组，
// 而 Origin 头永远是单个 URL，于是这一项从来没匹配上过——跨源请求的 ACAO 只能靠上面几个默认值兜着。
// 现在按逗号拆开逐个收进白名单，两种写法（单个、逗号串）都算配置正确。
const ALLOWED_ORIGINS = [
  'http://localhost:4000',
  'http://localhost:4001',
  'http://localhost:8080',
  SERVER_ORIGIN,
  process.env.FRONTEND_URL,
]
  .filter(Boolean)
  .flatMap((item) => String(item).split(','))
  .map((item) => item.trim())
  .filter(Boolean);

// ---------- 限流档位 ----------
// 每一档为什么这么定写在旁边，改数字的人先读理由。
const RATE_LIMITS = {
  // 滑块校验、短信发送/校验、自定义字段写操作共用的"写入口"档
  write: { limit: 60, windowMs: 60 * 1000 },
  // 登录：按 IP 收紧。移动网络出口 IP 被整片用户共享，所以这档只挡明显脚本洪水
  login: { limit: 100, windowMs: 5 * 60 * 1000 },
  // 注册按 IP：同上，宽口径
  registerIp: { limit: 30, windowMs: 10 * 60 * 1000 },
  // 注册按手机号：真正能精准指向滥用的是号码本身，防止有人拿一个出口批量注册
  registerPhone: { limit: 10, windowMs: 60 * 60 * 1000 },
  // 滑块校验成功会签发一枚放行注册的 token，不限速就能脚本猜坐标 ⇒ 比其他写入口更紧
  captchaVerify: { limit: 10, windowMs: 60 * 1000 },
};

module.exports = {
  ENV_FILE,
  MAX_BODY_SIZE,
  MAX_UPLOAD_SIZE,
  MAX_VECTOR_BODY,
  BODY_HARD_LIMIT,
  PORT,
  SERVER_ORIGIN,
  ALLOWED_ORIGINS,
  RATE_LIMITS,
  isProduction: () => process.env.NODE_ENV === 'production',
};
