const crypto = require('crypto');
const dbIndex = require('../db/index.js');
const paymentsDb = require('../db/payments.js');

// 支付配置
let wechatConfig = null;
let alipayConfig = null;
let depositAmount = 29.9;

// 微信 v3 与支付宝后台导出的密钥都是"无 PEM 头的 base64"，而 compose 注入多行值会把换行压成空格，
// 所以 PEM 原文 / 含字面 \n / base64 三种写法都要能还原成 crypto 认得的 PEM。
function loadKey(raw, kind) {
  if (!raw) return '';
  const value = raw.trim().replace(/\\n/g, '\n');
  if (value.includes('-----BEGIN')) return value;
  const body = value.replace(/\s+/g, '');
  const decoded = Buffer.from(body, 'base64').toString('utf8');
  if (decoded.includes('-----BEGIN')) return decoded.trim();
  return `-----BEGIN ${kind}-----\n${body.replace(/(.{64})/g, '$1\n').trimEnd()}\n-----END ${kind}-----`;
}

function initConfig(env) {
  depositAmount = parseFloat(env.DEPOSIT_AMOUNT) || 29.9;
  wechatConfig = {
    appId: env.WECHAT_APP_ID || '',
    mchId: env.WECHAT_MCH_ID || '',
    apiV3Key: env.WECHAT_API_V3_KEY || '',
    serialNo: env.WECHAT_MERCHANT_SERIAL_NO || '',
    privateKey: loadKey(env.WECHAT_MERCHANT_PRIVATE_KEY, 'PRIVATE KEY'),
    notifyUrl: env.WECHAT_NOTIFY_URL || '',
  };
  alipayConfig = {
    appId: env.ALIPAY_APP_ID || '',
    privateKey: loadKey(env.ALIPAY_PRIVATE_KEY, 'PRIVATE KEY'),
    alipayPublicKey: loadKey(env.ALIPAY_PUBLIC_KEY, 'PUBLIC KEY'),
    notifyUrl: env.ALIPAY_NOTIFY_URL || '',
    returnUrl: env.ALIPAY_RETURN_URL || '',
  };
}

function isPaymentConfigured() {
  const wechatReady = !!(wechatConfig.appId && wechatConfig.mchId && wechatConfig.apiV3Key
    && wechatConfig.serialNo && wechatConfig.privateKey);
  const alipayReady = !!(alipayConfig.appId && alipayConfig.privateKey);
  return { wechat: wechatReady, alipay: alipayReady, any: wechatReady || alipayReady };
}

function generateNonceStr(length = 32) {
  // 修复：原用 Math.random() 密码学不安全，可被预测重放。改用 crypto.randomBytes
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(bytes[i] % chars.length);
  return result;
}

function generateOrderId() {
  return 'PAY-' + crypto.randomUUID();
}

function buildAuthHeader(cfg, method, urlPath, body) {
  const nonceStr = generateNonceStr(32).toUpperCase();
  const timestamp = Math.floor(Date.now() / 1000);
  // 签名串末尾那个空 body 占位换行是 v3 规范要求的，缺了微信会回 401 签名错误
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${body ? body + '\n' : ''}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  const signature = sign.sign(cfg.privateKey, 'base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchId}",nonce_str="${nonceStr}",`
    + `signature="${signature}",timestamp="${timestamp}",serial_no="${cfg.serialNo}"`;
}

async function wechatV3Post(urlPath, body, cfg) {
  const res = await fetch('https://api.mch.weixin.qq.com' + urlPath, {
    method: 'POST',
    headers: {
      Authorization: buildAuthHeader(cfg, 'POST', urlPath, body),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'jzxr-deposit/1.0'
    },
    body: JSON.stringify(body),
    // 无超时会让微信侧挂起无限占着连接（v2 时代就踩过，这里保持同样的 10 秒上限）
    signal: AbortSignal.timeout(10000)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`微信下单 ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// 回调解密：APIv3 密钥只有商户与微信持有，GCM 认证标签校验通过即等价于"确认出自微信"
function decryptWechatResource(resource, apiV3Key) {
  const cipher = Buffer.from(resource.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key, 'utf8'),
    Buffer.from(resource.nonce, 'utf8')
  );
  decipher.setAAD(Buffer.from(resource.associated_data || '', 'utf8'));
  decipher.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([decipher.update(cipher.subarray(0, cipher.length - 16)), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

async function createWechatOrder(userId, amount) {
  if (!isPaymentConfigured().wechat) throw new Error('微信支付配置不完整');
  const orderId = generateOrderId();
  const data = await wechatV3Post('/v3/pay/transactions/native', {
    appid: wechatConfig.appId,
    mchid: wechatConfig.mchId,
    description: '保证金缴纳',
    out_trade_no: orderId,
    notify_url: wechatConfig.notifyUrl,
    amount: { total: Math.round(amount * 100), currency: 'CNY' }
  }, wechatConfig);
  if (!data.code_url) throw new Error('微信未返回 code_url');
  await paymentsDb.addPaymentOrder({ order_id: orderId, user_id: userId, amount: amount, channel: 'wechat', status: 'pending' });
  return { success: true, orderId: orderId, codeUrl: data.code_url };
}

async function handleWechatNotify(rawBody) {
  let payload;
  try {
    const envelope = JSON.parse(rawBody);
    if (envelope.event_type !== 'TRANSACTION.SUCCESS') return { success: false, message: '非支付成功通知' };
    payload = decryptWechatResource(envelope.resource, wechatConfig.apiV3Key);
  } catch (e) {
    return { success: false, message: '回调解析或解密失败' };
  }
  const orderId = payload.out_trade_no;
  const order = await paymentsDb.getPaymentOrder(orderId);
  if (!order) return { success: false, message: '订单不存在' };
  // 🔴 能解密只证明"出自微信"，不证明"金额对得上"。少这一步，一笔小额真实支付的通知就能把大额订单标成已付
  const paidFen = Number(payload.amount && payload.amount.total);
  const expectFen = Math.round(Number(order.amount) * 100);
  if (paidFen !== expectFen) return { success: false, message: '回调金额与订单不符' };
  // 微信会重复通知同一笔；已是 paid 就直接回成功，避免重复写 deposits
  if (order.status === 'paid') return { success: true, orderId: orderId };
  await paymentsDb.updatePaymentOrder(orderId, 'paid', payload.transaction_id);
  await paymentsDb.approveDepositByUserId(order.user_id, Number(order.amount));
  return { success: true, orderId: orderId };
}

function alipaySign(params, privateKey) {
  const sortedKeys = Object.keys(params).sort();
  const stringToSign = sortedKeys
    .filter(key => params[key] !== '' && params[key] !== undefined)
    .map(key => key + '=' + params[key])
    .join('&');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(stringToSign);
  return sign.sign(privateKey, 'base64');
}

async function createAlipayOrder(userId, amount) {
  if (!alipayConfig.appId || !alipayConfig.privateKey) throw new Error('支付宝配置不完整');
  const orderId = generateOrderId();
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const bizContent = { out_trade_no: orderId, total_amount: amount.toFixed(2), subject: '保证金缴纳', product_code: 'QUICK_WAP_WAY' };
  const params = {
    app_id: alipayConfig.appId, method: 'alipay.trade.wap.pay', format: 'JSON',
    return_url: alipayConfig.returnUrl, charset: 'utf-8', sign_type: 'RSA2',
    timestamp: timestamp, version: '1.0', notify_url: alipayConfig.notifyUrl,
    biz_content: JSON.stringify(bizContent),
  };
  params.sign = alipaySign(params, alipayConfig.privateKey);
  const queryString = Object.keys(params).map(key => key + '=' + encodeURIComponent(params[key])).join('&');
  const payUrl = 'https://openapi.alipay.com/gateway.do?' + queryString;
  await paymentsDb.addPaymentOrder({ order_id: orderId, user_id: userId, amount: amount, channel: 'alipay', status: 'pending' });
  return { success: true, orderId: orderId, payUrl: payUrl };
}

// 支付宝新旧文档对 sign_type 是否参与签名口径不一致，排错一个字段就是全部回调验签失败。
// 两种拼法各验一次，都要求同一把支付宝公钥签出，不构成放宽。
function verifyAlipaySign(params, publicKey) {
  const check = (dropSignType) => {
    const p = { ...params };
    delete p.sign;
    if (dropSignType) delete p.sign_type;
    const str = Object.keys(p).sort().filter(k => p[k] !== '' && p[k] !== undefined).map(k => k + '=' + p[k]).join('&');
    return crypto.createVerify('RSA-SHA256').update(str).verify(publicKey, params.sign, 'base64');
  };
  return check(true) || check(false);
}

async function handleAlipayNotify(params) {
  if (!alipayConfig.alipayPublicKey) return { success: false, message: '未配置支付宝公钥' };
  const sign = params.sign;
  if (!sign) return { success: false, message: '缺少签名' };
  if (!verifyAlipaySign(params, alipayConfig.alipayPublicKey)) return { success: false, message: '签名验证失败' };
  // 同一把支付宝公钥可被多个应用复用，不校验 app_id 就可能收到发给别站的合法回调
  if (params.app_id !== alipayConfig.appId) return { success: false, message: '回调 app_id 与配置不符' };
  if (params.trade_status !== 'TRADE_SUCCESS' && params.trade_status !== 'TRADE_FINISHED') return { success: false, message: '非支付成功通知' };
  const orderId = params.out_trade_no;
  const order = await paymentsDb.getPaymentOrder(orderId);
  if (!order) return { success: false, message: '订单不存在' };
  // 🔴 签名只证明"出自支付宝"，不证明金额对得上。少这一步，一笔小额真实支付就能把大额订单标成已付
  if (Number(params.total_amount).toFixed(2) !== Number(order.amount).toFixed(2)) return { success: false, message: '回调金额与订单不符' };
  if (order.status === 'paid') return { success: true, orderId: orderId };
  await paymentsDb.updatePaymentOrder(orderId, 'paid', params.trade_no);
  await paymentsDb.approveDepositByUserId(order.user_id, Number(order.amount));
  return { success: true, orderId: orderId };
}

async function createMockOrder(userId, amount, channel) {
  const orderId = generateOrderId();
  await paymentsDb.addPaymentOrder({ order_id: orderId, user_id: userId, amount: amount, channel: channel || 'mock', status: 'pending' });
  return {
    success: true,
    orderId: orderId,
    payUrl: '/api/payment/mock-pay?orderId=' + encodeURIComponent(orderId)
  };
}

async function mockPay(req, res, parsedUrl) {
  // 仅开发环境可用
  if (process.env.NODE_ENV === 'production') {
    res.writeHead(404, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({success: false, message: 'Not Found'}));
    return;
  }
  // Bearer token 认证
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.writeHead(401, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({success: false, message: '请先登录'}));
    return;
  }
  const userId = dbIndex.verifyToken(authHeader.slice(7));
  if (!userId) {
    res.writeHead(401, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({success: false, message: 'token无效'}));
    return;
  }
  const orderId = parsedUrl.query.orderId;
  if (!orderId) {
    res.writeHead(400, {'Content-Type': 'text/html; charset=utf-8'});
    res.end('<h1>缺少订单号</h1>');
    return;
  }
  const order = await paymentsDb.getPaymentOrder(orderId);
  if (!order) {
    res.writeHead(404, {'Content-Type': 'text/html; charset=utf-8'});
    res.end('<h1>订单不存在</h1>');
    return;
  }
  // 归属校验：只能支付自己的订单
  if (order.user_id !== userId) {
    res.writeHead(403, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({success: false, message: '无权操作此订单'}));
    return;
  }
  if (order.status === 'pending') {
    await paymentsDb.updatePaymentOrder(orderId, 'paid');
    await paymentsDb.approveDepositByUserId(order.user_id, order.amount);
  }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end('<html><head><meta charset="utf-8"><title>支付成功</title></head><body style="text-align:center;padding-top:50px;font-family:sans-serif;"><h1>✅ 模拟支付成功</h1><p>订单号：' + orderId + '</p><p><a href="/deposit">返回保证金页面</a></p></body></html>');
}

async function createPayment(req, res, readBodyWithLimit) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) { res.writeHead(401, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '未登录' })); return; }
  const token = authHeader.slice(7);
  const userId = dbIndex.verifyToken(token);
  if (!userId) { res.writeHead(401, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: 'token无效' })); return; }
  try {
    const body = await readBodyWithLimit(req);
    const data = JSON.parse(body);
    const { channel } = data;
    if (!channel) { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '缺少参数' })); return; }
    // 🔴 金额只认服务端配置。前端那个 29.9 是写死在 constants.ts 的展示值，请求体可被任意改写
    const amount = depositAmount;
    let result;
    const config = isPaymentConfigured();
    const isProd = process.env.NODE_ENV === 'production';
    if (channel === 'wechat') {
      if (!config.wechat && !isProd) result = await createMockOrder(userId, amount, 'wechat');
      else result = await createWechatOrder(userId, amount);
    } else if (channel === 'alipay') {
      if (!config.alipay && !isProd) result = await createMockOrder(userId, amount, 'alipay');
      else result = await createAlipayOrder(userId, amount);
    } else { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '不支持的支付渠道' })); return; }
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(result));
  } catch (e) { res.writeHead(500, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: e.message || '创建订单失败' })); }
}

async function wechatNotify(req, res, readBodyWithLimit) {
  // v3 用 HTTP 状态码决定是否重推：回 2xx 就等于宣告处理完成。
  // 失败必须回 5xx，否则微信不再重发，那一次失败就是永久丢单。
  const reply = (statusCode, payload) => {
    res.writeHead(statusCode, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(payload));
  };
  try {
    const body = await readBodyWithLimit(req);
    const result = await handleWechatNotify(body);
    if (result.success) reply(200, { code: 'SUCCESS' });
    else reply(500, { code: 'FAIL', message: result.message || '处理失败' });
  } catch (e) {
    reply(500, { code: 'FAIL', message: (e && e.message) || '服务器处理失败' });
  }
}

async function alipayNotify(req, res, readBodyWithLimit) {
  try {
    const body = await readBodyWithLimit(req);
    const params = {};
    body.split('&').forEach(pair => { const idx = pair.indexOf('='); const key = pair.substring(0, idx); const value = pair.substring(idx + 1); params[key] = decodeURIComponent(value || ''); });
    const result = await handleAlipayNotify(params);
    if (result.success) { res.writeHead(200, {'Content-Type': 'text/plain'}); res.end('success'); }
    else { res.writeHead(200, {'Content-Type': 'text/plain'}); res.end('fail'); }
  } catch (e) { res.writeHead(200, {'Content-Type': 'text/plain'}); res.end('fail'); }
}

async function queryPaymentStatus(req, res, parsedUrl) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) { res.writeHead(401, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '未登录' })); return; }
  const token = authHeader.slice(7);
  const userId = dbIndex.verifyToken(token);
  if (!userId) { res.writeHead(401, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: 'token无效' })); return; }
  const orderId = parsedUrl.query.orderId;
  if (!orderId) { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '缺少订单号' })); return; }
  const order = await paymentsDb.getPaymentOrder(orderId);
  if (!order || order.user_id !== userId) { res.writeHead(404, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '订单不存在' })); return; }
  res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify({ success: true, status: order.status }));
}

module.exports = { initConfig, createPayment, mockPay, wechatNotify, alipayNotify, queryPaymentStatus };
