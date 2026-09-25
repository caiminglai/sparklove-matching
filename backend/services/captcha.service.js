// ============================================================
// 业务逻辑层 - 滑动验证码服务
// 生成 SVG 拼图验证码，校验滑动位置，签发一次性通过令牌
// ============================================================

const crypto = require('crypto');

// 生产环境必须显式设置 CAPTCHA_SECRET，dev 兜底固定避免重启轮换
const _isProd = process.env.NODE_ENV === 'production';
if (_isProd && !process.env.CAPTCHA_SECRET) {
  throw new Error('生产环境必须设置 CAPTCHA_SECRET 环境变量');
}
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || 'dev-fixed-captcha-secret-do-not-use-in-prod-001';
const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5 分钟有效
const TOLERANCE_PX = 8; // 允许误差 8 像素

// 内存存储：{ captchaId: { targetX, used, expiresAt } }
const captchaStore = new Map();

function generateCaptchaId() {
  return crypto.randomBytes(16).toString('hex');
}

function signCaptcha(captchaId, targetX) {
  return crypto
    .createHmac('sha256', CAPTCHA_SECRET)
    .update(`${captchaId}:${targetX}`)
    .digest('hex');
}

function cleanupExpired() {
  const now = Date.now();
  for (const [id, record] of captchaStore) {
    if (record.expiresAt < now) captchaStore.delete(id);
  }
}

setInterval(cleanupExpired, 60 * 1000);

// 生成背景 SVG（带缺口）和拼图块 SVG
function createCaptcha() {
  cleanupExpired();

  const width = 300;
  const height = 150;
  const pieceW = 42;
  const pieceH = 42;
  // 缺口随机位置，留出边距
  const targetX = Math.floor(Math.random() * (width - pieceW - 80)) + 50;
  const targetY = Math.floor(Math.random() * (height - pieceH - 40)) + 20;
  const captchaId = generateCaptchaId();

  captchaStore.set(captchaId, {
    targetX,
    targetY,
    pieceW,
    pieceH,
    used: false,
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  });

  // 背景：随机噪点 + 缺口遮罩（用白色方块表示缺口位置，实际可配背景色）
  const circles = Array.from({ length: 20 })
    .map(() => {
      const cx = Math.floor(Math.random() * width);
      const cy = Math.floor(Math.random() * height);
      const r = Math.floor(Math.random() * 10) + 3;
      const color = `rgba(60,46,32,${(Math.random() * 0.08 + 0.05).toFixed(2)})`;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" />`;
    })
    .join('');

  const backgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#F5EDE3" />
    ${circles}
    <rect x="${targetX}" y="${targetY}" width="${pieceW}" height="${pieceH}" rx="6" fill="#E8DED0" stroke="#D4C8B8" stroke-width="2" />
    <text x="${width / 2}" y="${height - 20}" text-anchor="middle" fill="#8B7B6B" font-size="12" font-family="Arial">拖动拼图块到缺口位置</text>
  </svg>`;

  const pieceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pieceW}" height="${pieceH}" viewBox="0 0 ${pieceW} ${pieceH}">
    <rect width="100%" height="100%" rx="6" fill="#E87A5D" />
    <circle cx="${pieceW / 2}" cy="${pieceH / 2}" r="8" fill="#FFFDF9" />
  </svg>`;

  return {
    captchaId,
    background: 'data:image/svg+xml;base64,' + Buffer.from(backgroundSvg).toString('base64'),
    piece: 'data:image/svg+xml;base64,' + Buffer.from(pieceSvg).toString('base64'),
    width,
    height,
    pieceW,
    pieceH,
    targetY,
  };
}

// 校验滑动结果，成功返回一次性 token
function verifyCaptcha(captchaId, x) {
  cleanupExpired();

  const record = captchaStore.get(captchaId);
  if (!record) return { success: false, message: '验证码已过期' };
  if (record.used) return { success: false, message: '验证码已使用' };
  if (record.expiresAt < Date.now()) {
    captchaStore.delete(captchaId);
    return { success: false, message: '验证码已过期' };
  }

  const dx = Math.abs(Number(x) - record.targetX);
  if (dx > TOLERANCE_PX) {
    return { success: false, message: '验证失败，请重试' };
  }

  record.used = true;
  captchaStore.set(captchaId, record);

  const token = signCaptcha(captchaId, record.targetX);
  return { success: true, token };
}

// 注册时校验一次性 token
function checkCaptchaToken(captchaId, token) {
  cleanupExpired();

  const record = captchaStore.get(captchaId);
  if (!record || !record.used || record.expiresAt < Date.now()) {
    return false;
  }
  return signCaptcha(captchaId, record.targetX) === token;
}

module.exports = {
  createCaptcha,
  verifyCaptcha,
  checkCaptchaToken,
};
