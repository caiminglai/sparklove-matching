const crypto = require('crypto');
const dbIndex = require('../db/index.js');
const paymentsDb = require('../db/payments.js');

// 支付配置
let wechatConfig = null;
let alipayConfig = null;

function initConfig(env) {
  wechatConfig = {
    appId: env.WECHAT_APP_ID || '',
    mchId: env.WECHAT_MCH_ID || '',
    apiKey: env.WECHAT_API_KEY || '',
    notifyUrl: env.WECHAT_NOTIFY_URL || '',
  };
  alipayConfig = {
    appId: env.ALIPAY_APP_ID || '',
    privateKey: env.ALIPAY_PRIVATE_KEY || '',
    alipayPublicKey: env.ALIPAY_PUBLIC_KEY || '',
    notifyUrl: env.ALIPAY_NOTIFY_URL || '',
    returnUrl: env.ALIPAY_RETURN_URL || '',
  };
}

function isPaymentConfigured() {
  const wechatReady = !!(wechatConfig.appId && wechatConfig.mchId && wechatConfig.apiKey);
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

function wechatSign(params, apiKey) {
  const sortedKeys = Object.keys(params).sort();
  const stringA = sortedKeys
    .filter(key => params[key] !== '' && params[key] !== undefined)
    .map(key => key + '=' + params[key])
    .join('&');
  const stringSignTemp = stringA + '&key=' + apiKey;
  return crypto.createHash('md5').update(stringSignTemp).digest('hex').toUpperCase();
}

async function createWechatOrder(userId, amount, clientIp) {
  if (!wechatConfig.appId || !wechatConfig.mchId || !wechatConfig.apiKey) throw new Error('微信支付配置不完整');
  const orderId = generateOrderId();
  const nonceStr = generateNonceStr();
  const params = {
    appid: wechatConfig.appId, mch_id: wechatConfig.mchId, nonce_str: nonceStr,
    body: '保证金缴纳', out_trade_no: orderId, total_fee: Math.round(amount * 100),
    spbill_create_ip: clientIp, notify_url: wechatConfig.notifyUrl, trade_type: 'MWEB',
  };
  params.sign = wechatSign(params, wechatConfig.apiKey);
  const xml = buildXml(params);
  const https = require('https');
  return new Promise((resolve, reject) => {
    // 修复：原无超时，微信侧挂起会无限等待占用连接。加 10 秒超时
    const req = https.request({ hostname: 'api.mch.weixin.qq.com', port: 443, path: '/pay/unifiedorder', method: 'POST', timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        try {
          const result = parseXml(data);
          if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
            await paymentsDb.addPaymentOrder({ order_id: orderId, user_id: userId, amount: amount, channel: 'wechat', status: 'pending' });
            resolve({ success: true, orderId: orderId, payUrl: result.mweb_url });
          } else { reject(new Error(result.return_msg || '创建订单失败')); }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('微信下单接口超时')); });
    req.write(xml);
    req.end();
  });
}

async function handleWechatNotify(xmlData) {
  const result = parseXml(xmlData);
  const sign = result.sign;
  delete result.sign;
  const calculatedSign = wechatSign(result, wechatConfig.apiKey);
  if (sign !== calculatedSign) return { success: false, message: '签名验证失败' };
  if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
    const orderId = result.out_trade_no;
    const order = await paymentsDb.getPaymentOrder(orderId);
    if (order && order.status === 'pending') {
      await paymentsDb.updatePaymentOrder(orderId, 'paid');
      await paymentsDb.approveDepositByUserId(order.user_id, order.amount);
      return { success: true, orderId: orderId };
    }
  }
  return { success: false, message: '处理失败' };
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

async function handleAlipayNotify(params) {
  const sign = params.sign;
  delete params.sign;
  delete params.sign_type;
  const verify = crypto.createVerify('RSA-SHA256');
  const stringToVerify = Object.keys(params).sort().filter(key => params[key] !== '' && params[key] !== undefined).map(key => key + '=' + params[key]).join('&');
  verify.update(stringToVerify);
  if (!verify.verify(alipayConfig.alipayPublicKey, sign, 'base64')) return { success: false, message: '签名验证失败' };
  if (params.trade_status === 'TRADE_SUCCESS') {
    const orderId = params.out_trade_no;
    const order = await paymentsDb.getPaymentOrder(orderId);
    if (order && order.status === 'pending') {
      await paymentsDb.updatePaymentOrder(orderId, 'paid');
      await paymentsDb.approveDepositByUserId(order.user_id, order.amount);
      return { success: true, orderId: orderId };
    }
  }
  return { success: false, message: '处理失败' };
}

function buildXml(params) {
  let xml = '<xml>';
  for (const [key, value] of Object.entries(params)) xml += '<' + key + '><![CDATA[' + value + ']]></' + key + '>';
  xml += '</xml>';
  return xml;
}

function parseXml(xml) {
  const result = {};
  const regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const key = match[1] || match[3];
    const value = match[2] || match[4];
    result[key] = value;
  }
  return result;
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
    const { channel, amount } = data;
    if (!channel || !amount) { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '缺少参数' })); return; }
    let result;
    const config = isPaymentConfigured();
    const isProd = process.env.NODE_ENV === 'production';
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    if (channel === 'wechat') {
      if (!config.wechat && !isProd) result = await createMockOrder(userId, amount, 'wechat');
      else result = await createWechatOrder(userId, amount, clientIp);
    } else if (channel === 'alipay') {
      if (!config.alipay && !isProd) result = await createMockOrder(userId, amount, 'alipay');
      else result = await createAlipayOrder(userId, amount);
    } else { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '不支持的支付渠道' })); return; }
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(result));
  } catch (e) { res.writeHead(500, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: e.message || '创建订单失败' })); }
}

async function wechatNotify(req, res, readBodyWithLimit) {
  try {
    const body = await readBodyWithLimit(req);
    const result = await handleWechatNotify(body);
    if (result.success) { res.writeHead(200, {'Content-Type': 'text/xml'}); res.end('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>'); }
    else { res.writeHead(200, {'Content-Type': 'text/xml'}); res.end('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[FAIL]]></return_msg></xml>'); }
  } catch (e) { res.writeHead(200, {'Content-Type': 'text/xml'}); res.end('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[FAIL]]></return_msg></xml>'); }
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
