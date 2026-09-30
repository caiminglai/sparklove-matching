const crypto = require('crypto');
const dbIndex = require('../db/index.js');
const paymentsDb = require('../db/payments.js');
const paymentVerify = require('../utils/payment-verify.js');
const pricing = require('../utils/pricing.js');
const adminDb = require('../db/admin.js');
const { sendJson } = require('../utils/sendJson');

// 支付配置
let wechatConfig = null;
let alipayConfig = null;

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

// 假支付（直接置 paid）必须显式开闸：线上容器 NODE_ENV 是 development，只靠它拦不住；
// 微信渠道若不配就会一直落到 mock 分支，登录用户点一下就能把保证金标成已付。
function mockPayAllowed() {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_MOCK_PAY === '1';
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

// 一笔订单付完该改什么，全在这里分派。支付宝回调、微信回调、模拟支付三条路共用同一个出口，
// 免得各写一遍导致"线上通了本地测不到"或反过来。
const PURPOSES = {
  deposit: { pricingItem: 'deposit', subject: '保证金缴纳' },
  contact_unlock: { pricingItem: 'contactUnlock', subject: '查看联系方式' },
};

function resolvePurpose(raw) {
  if (raw === undefined || raw === null || raw === '') return 'deposit';
  return PURPOSES[String(raw)] ? String(raw) : null;
}

async function applyOrderEffect(order) {
  if ((order.purpose || 'deposit') === 'contact_unlock') {
    if (!order.target_id) {
      console.warn('[payment] 解锁订单缺 target_id，钱已入账但没解锁：', order.order_id);
      return false;
    }
    await paymentsDb.unlockContact(order.user_id, order.target_id, '支付自动解锁');
    return true;
  }
  await paymentsDb.approveDepositByUserId(order.user_id, Number(order.amount));
  return true;
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

async function createWechatOrder(userId, amount, opts) {
  if (!isPaymentConfigured().wechat) throw new Error('微信支付配置不完整');
  const purpose = (opts && opts.purpose) || 'deposit';
  const orderId = generateOrderId();
  const data = await wechatV3Post('/v3/pay/transactions/native', {
    appid: wechatConfig.appId,
    mchid: wechatConfig.mchId,
    description: PURPOSES[purpose].subject,
    out_trade_no: orderId,
    notify_url: wechatConfig.notifyUrl,
    amount: { total: Math.round(amount * 100), currency: 'CNY' }
  }, wechatConfig);
  if (!data.code_url) throw new Error('微信未返回 code_url');
  await paymentsDb.addPaymentOrder({ order_id: orderId, user_id: userId, amount: amount, channel: 'wechat', status: 'pending', purpose: purpose, target_id: opts && opts.targetId });
  return { success: true, orderId: orderId, codeUrl: data.code_url };
}

async function handleWechatNotify(rawBody) {
  // 每个失败都带 retryable：能靠微信重推救回来的才回 5xx，伪通知回 204 收口（见 wechatNotify）
  // 微信支付没配齐时压根下不了单（createWechatOrder 会先 throw），此时的通知必然不是自家产生的；
  // 但归类成可重试：未配置多半是重新部署时 .env 没挂上这类本站侧的临时状态，配置补齐后微信重推还能把这单救回来。
  // 这条早退同时保证 .env 缺支付键时的优雅降级——不进解密、不抛异常
  if (!isPaymentConfigured().wechat) {
    console.warn('[wechatNotify] 收到通知但本站微信支付未配齐，按可重试失败处理');
    return { success: false, retryable: true, message: '微信支付未配置' };
  }
  let envelope;
  try {
    envelope = JSON.parse(rawBody);
  } catch (e) {
    return { success: false, retryable: true, message: '回调报文解析失败' };
  }
  if (!envelope || typeof envelope !== 'object' || !envelope.event_type || !envelope.resource) {
    // 结构不完整的报文（含运维文档里 `curl -d {}` 那条探活）留 500，
    // 这样"回 5xx 才说明请求打到了后端、没被前端 SPA 兜底吃掉"这个判据继续成立
    return { success: false, retryable: true, message: '回调报文结构不完整' };
  }
  if (envelope.event_type !== 'TRANSACTION.SUCCESS') {
    // 退款等事件也推到同一个地址，本站没有对应处理逻辑；回 5xx 只会让微信按策略空重推一整天
    return { success: false, retryable: false, message: '非支付成功通知' };
  }
  let payload;
  try {
    payload = decryptWechatResource(envelope.resource, wechatConfig.apiV3Key);
  } catch (e) {
    // 密钥轮换或配置刚改还没生效时，下一次重推就能解开，这类留给微信重试
    return { success: false, retryable: true, message: '回调解密失败' };
  }
  const orderId = payload && payload.out_trade_no;
  if (!orderId) return { success: false, retryable: false, message: '通知缺少 out_trade_no' };
  const order = await paymentsDb.getPaymentOrder(orderId);
  if (!order) return { success: false, retryable: true, message: '订单不存在' };
  // 🔴 能解密只证明"出自微信持有同一把密钥的一方"，不证明这笔钱是付给本站这张单的。
  // 交易状态、appid/mchid、金额三项全部对齐才允许入账
  const verdict = paymentVerify.screenWechatNotify({ payload, order, config: wechatConfig });
  if (!verdict.ok) {
    // verdict.log 只含订单号、金额与两个公开标识符；密钥/证书/密文/签名串不允许进日志
    console.warn('[wechatNotify] 拒绝入账：' + verdict.reason, verdict.log);
    return { success: false, retryable: false, message: verdict.reason };
  }
  // 微信会重复通知同一笔；已是 paid 就直接回成功，避免重复写 deposits
  if (order.status === 'paid') return { success: true, orderId: orderId };
  await paymentsDb.updatePaymentOrder(orderId, 'paid', payload.transaction_id);
  await applyOrderEffect(order);
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

async function createAlipayOrder(userId, amount, opts) {
  if (!alipayConfig.appId || !alipayConfig.privateKey) throw new Error('支付宝配置不完整');
  const purpose = (opts && opts.purpose) || 'deposit';
  const orderId = generateOrderId();
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  // method 与 product_code 必须成对：后台开通的是「电脑网站支付」(page.pay / FAST_INSTANT_TRADE_PAY)，
  // 换回手机网站支付要先在后台开通那件产品，否则支付宝回 sub_code 报错。
  const bizContent = { out_trade_no: orderId, total_amount: amount.toFixed(2), subject: PURPOSES[purpose].subject, product_code: 'FAST_INSTANT_TRADE_PAY' };
  const params = {
    app_id: alipayConfig.appId, method: 'alipay.trade.page.pay', format: 'JSON',
    return_url: alipayConfig.returnUrl, charset: 'utf-8', sign_type: 'RSA2',
    timestamp: timestamp, version: '1.0', notify_url: alipayConfig.notifyUrl,
    biz_content: JSON.stringify(bizContent),
  };
  params.sign = alipaySign(params, alipayConfig.privateKey);
  const queryString = Object.keys(params).map(key => key + '=' + encodeURIComponent(params[key])).join('&');
  const payUrl = 'https://openapi.alipay.com/gateway.do?' + queryString;
  await paymentsDb.addPaymentOrder({ order_id: orderId, user_id: userId, amount: amount, channel: 'alipay', status: 'pending', purpose: purpose, target_id: opts && opts.targetId });
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
  await applyOrderEffect(order);
  return { success: true, orderId: orderId };
}

async function createMockOrder(userId, amount, channel, opts) {
  const orderId = generateOrderId();
  await paymentsDb.addPaymentOrder({ order_id: orderId, user_id: userId, amount: amount, channel: channel || 'mock', status: 'pending', purpose: (opts && opts.purpose) || 'deposit', target_id: opts && opts.targetId });
  return {
    success: true,
    orderId: orderId,
    payUrl: '/api/payment/mock-pay?orderId=' + encodeURIComponent(orderId)
  };
}

async function mockPay(req, res, parsedUrl) {
  // 仅开发环境且显式开闸时可用
  if (!mockPayAllowed()) {
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
    await applyOrderEffect(order);
  }
  const back = (order.purpose || 'deposit') === 'contact_unlock'
    ? { label: '返回查看联系方式', href: '/' }
    : { label: '返回保证金页面', href: '/deposit' };
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end('<html><head><meta charset="utf-8"><title>支付成功</title></head><body style="text-align:center;padding-top:50px;font-family:sans-serif;"><h1>✅ 模拟支付成功</h1><p>订单号：' + orderId + '</p><p><a href="' + back.href + '">' + back.label + '</a></p></body></html>');
}

async function createOrderFor(req, res, readBodyWithLimit, forcedPurpose) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) { res.writeHead(401, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '未登录' })); return; }
  const userId = dbIndex.verifyToken(authHeader.slice(7));
  if (!userId) { res.writeHead(401, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: 'token无效' })); return; }
  try {
    const body = await readBodyWithLimit(req);
    const data = JSON.parse(body);
    const { channel } = data;
    if (!channel) { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '缺少参数' })); return; }
    const purpose = forcedPurpose || resolvePurpose(data.purpose);
    if (!purpose) { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '不支持的支付用途' })); return; }
    let targetId = null;
    if (purpose === 'contact_unlock') {
      targetId = data.target_user_id || data.targetUserId || null;
      if (!targetId) { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '缺少解锁对象' })); return; }
      targetId = String(targetId);
      if (targetId === String(userId)) { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '无需解锁自己的联系方式' })); return; }
      const targetRow = await dbIndex.getDb().prepare('SELECT 1 AS hit FROM users WHERE id = $1 OR user_id = $2 LIMIT 1').get(targetId, targetId);
      if (!targetRow) { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '要解锁的用户不存在' })); return; }
      if (await paymentsDb.checkContactUnlocked(userId, targetId)) { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '该联系方式已解锁，无需重复支付' })); return; }
    }
    // 🔴 金额只认服务端配置。请求体里的 amount 可被任意改写，前端那个数只是展示值；
    // 具体数字在后台「价格设置」里改，读的是 admin_settings
    const amount = await pricing.getYuan(PURPOSES[purpose].pricingItem);
    const opts = { purpose: purpose, targetId: targetId };
    const config = isPaymentConfigured();
    const allowMock = mockPayAllowed();
    let result;
    if (channel === 'wechat') {
      if (!config.wechat && allowMock) result = await createMockOrder(userId, amount, 'wechat', opts);
      else if (!config.wechat) { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '微信支付暂未开通' })); return; }
      else result = await createWechatOrder(userId, amount, opts);
    } else if (channel === 'alipay') {
      if (!config.alipay && allowMock) result = await createMockOrder(userId, amount, 'alipay', opts);
      else if (!config.alipay) { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '支付宝暂未开通' })); return; }
      else result = await createAlipayOrder(userId, amount, opts);
    } else { res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: '不支持的支付渠道' })); return; }
    result.purpose = purpose;
    result.amount = amount;
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(result));
  } catch (e) { res.writeHead(500, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify({ success: false, message: e.message || '创建订单失败' })); }
}

async function createPayment(req, res, readBodyWithLimit) {
  return createOrderFor(req, res, readBodyWithLimit, null);
}

// POST /api/payments/view-contact：用途写死成 contact_unlock，不接受前端传 purpose，
// 这个入口只干"付钱解锁某个人的联系方式"这一件事。返回体与 /api/payment/create 同形。
async function viewContactPayment(req, res, readBodyWithLimit) {
  return createOrderFor(req, res, readBodyWithLimit, 'contact_unlock');
}

async function wechatNotify(req, res, readBodyWithLimit) {
  // v3 用 HTTP 状态码决定是否重推：回 2xx 就等于宣告处理完成，非 2xx/204 会被按策略重推约一天。
  // 所以两类失败要分开：暂时处理不了的（解密失败、订单暂时查不到）回 5xx 换重推，
  // 金额/身份不符这种重推多少次也不会变好的伪通知回 204 收口，别把重推队列和日志刷满。
  const reply = (statusCode, payload) => {
    res.writeHead(statusCode, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(payload));
  };
  const ackAndStopRetry = () => {
    // 204 是微信文档认可的"已收到"应答，且按规范不带 body
    res.writeHead(204);
    res.end();
  };
  try {
    const body = await readBodyWithLimit(req);
    const result = await handleWechatNotify(body);
    if (result.success) reply(200, { code: 'SUCCESS' });
    else if (result.retryable === false) ackAndStopRetry();
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
  res.end(JSON.stringify({ success: true, status: order.status, purpose: order.purpose || 'deposit', targetId: order.target_id || null }));
}

// ============================================================
// 价格配置（金额存 admin_settings，后台「价格设置」直接改，不用动代码）
// ============================================================

/** GET /api/payment/config：公开，只回前端要展示的那几个数（标价 + 保证金三档拆分） */
async function publicConfig(req, res) {
  try {
    const view = await pricing.publicView();
    const cfg = isPaymentConfigured();
    sendJson(res, 200, {
      success: true,
      data: view,
      alipay_online: cfg.alipay,
      wechat_online: cfg.wechat,
    });
  } catch (e) {
    console.error('[价格] 读取公开配置失败:', e.message);
    sendJson(res, 500, { success: false, message: '读取价格配置失败' });
  }
}

/** GET /api/admin/payment-price：当前价、代码默认值、来源、上次改动时间 */
async function adminGetPrice(req, res, checkAdminAuth) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  try {
    sendJson(res, 200, { success: true, data: await pricing.describeAll() });
  } catch (e) {
    console.error('[价格] 读取价格配置失败:', e.message);
    sendJson(res, 500, { success: false, message: '读取价格配置失败' });
  }
}

/**
 * PUT /api/admin/payment-price：body 里给了哪个改哪个。
 * 只影响之后新建的订单：payment_orders 每行都存着下单那一刻的 amount，
 * 回调与查单核对的都是自己那一行，所以改价不会让正在付的单子对不上账。
 */
async function adminSavePrice(req, res, checkAdminAuth, readBodyWithLimit) {
  if (!(await checkAdminAuth(req))) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  readBodyWithLimit(req).then(async body => {
    let data;
    try {
      data = JSON.parse(body);
    } catch (e) {
      sendJson(res, 400, { success: false, message: '请求格式错误' }); return;
    }
    const pending = [];
    for (const name of pricing.itemNames()) {
      const raw = data[pricing.ITEMS[name].field];
      if (raw === undefined || raw === null || raw === '') continue;
      const parsed = pricing.parseAmountYuan(raw);
      if (!parsed.ok) {
        sendJson(res, 400, { success: false, message: pricing.ITEMS[name].label + '：' + parsed.error });
        return;
      }
      pending.push({ name, fen: parsed.fen });
    }
    if (!pending.length) {
      sendJson(res, 400, { success: false, message: '没有要改的金额' }); return;
    }
    // 先整体校验再落库：保证金与它的三档拆分必须对得上账，逐项边校验边写会留下写了一半的不一致状态
    const overrides = {};
    for (const p of pending) overrides[p.name] = p.fen;
    const split = await pricing.splitCheck(overrides);
    if (!split.ok) {
      sendJson(res, 400, {
        success: false,
        message: `保证金拆分对不上：平台运营费 + 虚假信息赔付 + 删除可退 = ${split.sum / 100} 元，` +
          `保证金是 ${split.deposit / 100} 元。请把保证金与这三档一起填成能加得上的数。`,
      });
      return;
    }
    const changes = [];
    for (const p of pending) {
      await pricing.setAmountFen(p.name, p.fen);
      changes.push({ field: pricing.ITEMS[p.name].field, amount_fen: p.fen });
    }
    await adminDb.logAdminAction('update_price', null, { changes });
    console.log('[价格] 标价变更:', JSON.stringify(changes));
    sendJson(res, 200, { success: true, message: '价格已更新', data: await pricing.describeAll() });
  }).catch(e => {
    sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
  });
}

module.exports = {
  initConfig,
  createPayment,
  viewContactPayment,
  mockPay,
  wechatNotify,
  alipayNotify,
  queryPaymentStatus,
  publicConfig,
  adminGetPrice,
  adminSavePrice,
};
