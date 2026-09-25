/**
 * 支付回调"能不能入账"的判定（纯函数：不碰网络、不碰数据库、不读环境变量）
 *
 * 单独立文件的原因：payment.js 里混着 fetch 和 pg，这段判断没法直接跑单测，
 * 而它恰恰是挡住"假通知把订单刷成已付"的最后一道闸；顺便把入账门槛收在一处，
 * 以后加渠道不至于漏掉某一项校验。
 */

// 元 → 分。库里的 amount 是 NUMERIC(10,2)，pg 会按字符串回传（"29.90"），
// 所以订单侧必须容得下字符串；换算后与整数分还有偏差的（29.999 这类）说明压根不是"元"，判为不可折算。
function yuanToFen(yuan) {
  const num = typeof yuan === 'number'
    ? yuan
    : (typeof yuan === 'string' && yuan.trim() !== '' ? Number(yuan) : NaN);
  if (!Number.isFinite(num)) return NaN;
  const fen = num * 100;
  if (Math.abs(fen - Math.round(fen)) > 1e-6) return NaN;
  return Math.round(fen);
}

/**
 * 通知里的实付金额（微信 v3 的 resource.amount.total，单位分）是否与订单应收一致。
 *
 * 通知侧刻意从严：正常微信报文里 amount.total 恒为正整数，出现字符串 / null / NaN / 小数
 * 就说明这条通知不是自家下单产生的，宁可拒单也不入账。
 * 订单侧走 yuanToFen 的宽松换算，兼容 pg 回传的 "29.90"。
 *
 * @param {unknown} notifyTotal 通知里的 amount.total（分）
 * @param {unknown} orderAmount 订单里的应收（元，可能是字符串）
 * @returns {boolean}
 */
function isPaidAmountTrusted(notifyTotal, orderAmount) {
  if (!Number.isInteger(notifyTotal) || notifyTotal <= 0) return false;
  const expectFen = yuanToFen(orderAmount);
  if (!Number.isInteger(expectFen) || expectFen <= 0) return false;
  return notifyTotal === expectFen;
}

/**
 * 通知是不是发给本站的。同一把 APIv3 密钥可能被商户号下多个 appid 复用，
 * 不比对身份就会把别处的真实支付算到本站订单上。
 * 本站没配 appid/mchid 时判为不可信：配置不全是根本下不了单的（见 isPaymentConfigured），
 * 能解密走到这一步只能说明密钥与配置不同源，不存在"误伤正常用户"的路径。
 *
 * @param {{appid?:string, mchid?:string}} payload 解密后的交易内容
 * @param {{appId?:string, mchId?:string}} config 本站微信配置
 */
function isNotifyAddressedToUs(payload, config) {
  const expectedAppId = config && config.appId;
  const expectedMchId = config && config.mchId;
  if (!expectedAppId || !expectedMchId) return false;
  if (!payload || typeof payload !== 'object') return false;
  return payload.appid === expectedAppId && payload.mchid === expectedMchId;
}

// 外层 event_type 说 SUCCESS 不代表交易本身成功，退款/关闭的通知也会推到同一个地址
function isTradeSuccess(payload) {
  return !!payload && typeof payload === 'object' && payload.trade_state === 'SUCCESS';
}

/**
 * 日志字段消毒：只放行标量、去掉换行、限长。
 * 绝不允许对象进日志——通知原文里带着 ciphertext / nonce / 签名串，本站密钥和证书也绝不能出现。
 */
function safeLogValue(value) {
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value !== 'string') return '[不支持的类型]';
  return value.replace(/[\r\n\t]/g, '').slice(0, 64);
}

/**
 * 入账前的统一体检：交易状态 → 通知身份 → 金额。
 *
 * 返回 ok:false 时调用方必须拒绝更新订单；且这类失败再怎么重试也不会变好，
 * 属于"回 2xx 让微信别再重推"的伪通知（区别于订单暂时查不到、解密失败这类可重试故障）。
 *
 * @param {{payload:object, order:object, config:object}} input
 * @returns {{ok:true}|{ok:false, reason:string, log:object}}
 */
function screenWechatNotify({ payload, order, config }) {
  // 键名用英文：这几项直接进服务器日志，便于 grep 也与站内其它日志字段一致
  const log = {
    orderId: safeLogValue(payload && payload.out_trade_no),
    notifyFen: safeLogValue(payload && payload.amount && payload.amount.total),
    expectFen: safeLogValue(order ? yuanToFen(order.amount) : null),
    notifyAppid: safeLogValue(payload && payload.appid),
    notifyMchid: safeLogValue(payload && payload.mchid),
  };
  const reject = reason => ({ ok: false, reason, log });

  if (!payload || typeof payload !== 'object') return reject('通知内容不是合法对象');
  if (!isTradeSuccess(payload)) return reject('交易状态非 SUCCESS');
  if (!isNotifyAddressedToUs(payload, config)) return reject('通知 appid/mchid 与本站配置不符');
  if (!isPaidAmountTrusted(payload.amount && payload.amount.total, order && order.amount)) {
    return reject('回调金额与订单应收不符');
  }
  return { ok: true };
}

module.exports = {
  yuanToFen,
  isPaidAmountTrusted,
  isNotifyAddressedToUs,
  isTradeSuccess,
  safeLogValue,
  screenWechatNotify,
};
