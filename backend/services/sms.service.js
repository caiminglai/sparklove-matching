// ============================================================
// 业务逻辑层 - 短信服务（预留接口位置）
// ============================================================
// 当前为占位实现，后续对接短信服务商（阿里云、腾讯云等）后，
// 可直接替换 sendRegisterCode / verifyRegisterCode 的具体实现。

// 验证码内存缓存（生产环境建议替换为 Redis）
const smsCodeStore = new Map();
const SMS_CODE_TTL_MS = 5 * 60 * 1000; // 5 分钟有效
const SMS_CODE_INTERVAL_MS = 60 * 1000; // 60 秒发送间隔

function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [key, record] of smsCodeStore) {
    if (now - record.createdAt > SMS_CODE_TTL_MS) {
      smsCodeStore.delete(key);
    }
  }
}

// 生成 6 位数字验证码
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 发送注册短信验证码（预留接口）
// TODO: 对接短信服务商后，替换为真实发送逻辑
function sendRegisterCode(phone) {
  cleanupExpiredCodes();
  if (!phone || !/^1\d{10}$/.test(phone)) {
    return { success: false, message: '手机号格式不正确' };
  }

  const key = `register:${phone}`;
  const existing = smsCodeStore.get(key);
  if (existing && Date.now() - existing.createdAt < SMS_CODE_INTERVAL_MS) {
    return { success: false, message: '发送过于频繁，请稍后再试' };
  }

  const code = generateCode();
  smsCodeStore.set(key, {
    code,
    createdAt: Date.now(),
    verified: false,
  });

  // TODO: 在此处调用短信服务商 API 发送验证码
  // 示例：await smsProvider.send({ phone, code, templateId: 'REGISTER' });
  console.log(`[SMS MOCK] 注册验证码已发送至 ${phone}: ${code}`);

  return { success: true, message: '验证码已发送' };
}

// 校验注册短信验证码（预留接口）
function verifyRegisterCode(phone, code) {
  cleanupExpiredCodes();
  if (!phone || !code) {
    return { success: false, message: '手机号和验证码不能为空' };
  }

  const key = `register:${phone}`;
  const record = smsCodeStore.get(key);
  if (!record) {
    return { success: false, message: '验证码不存在或已过期' };
  }
  if (Date.now() - record.createdAt > SMS_CODE_TTL_MS) {
    smsCodeStore.delete(key);
    return { success: false, message: '验证码已过期' };
  }
  if (record.code !== code) {
    return { success: false, message: '验证码错误' };
  }

  record.verified = true;
  return { success: true, message: '验证码校验通过' };
}

module.exports = {
  sendRegisterCode,
  verifyRegisterCode,
};
