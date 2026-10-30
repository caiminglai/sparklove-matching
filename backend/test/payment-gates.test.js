// ============================================================
// 收钱那几道判据：假通知不许把订单刷成已付，后台改价不许写进浮点
//
// payment-verify.js 是"能不能入账"的最后一道闸（纯函数，不碰网络不碰库），
// pricing.parseAmountYuan 是后台改价的唯一格式门。这两处一旦松，
// 受影响的是真金白银，所以每个分支都钉住，包括"故意从严"的那一侧。
// ============================================================
require('./helpers/env');

const test = require('node:test');
const assert = require('node:assert');

const {
  yuanToFen,
  isPaidAmountTrusted,
  isNotifyAddressedToUs,
  isTradeSuccess,
  safeLogValue,
  screenWechatNotify,
} = require('../utils/payment-verify');
const { parseAmountYuan, itemNames } = require('../utils/pricing');

const CONFIG = { appId: 'wx-app-0001', mchId: 'mch-0001' };
const GOOD = {
  out_trade_no: 'ord_1',
  trade_state: 'SUCCESS',
  appid: 'wx-app-0001',
  mchid: 'mch-0001',
  amount: { total: 2990 },
};

test('元 → 分：pg 回传的字符串要吃，对不整的"元"要拒', () => {
  assert.strictEqual(yuanToFen('29.90'), 2990, 'NUMERIC(10,2) 经 pg 是字符串');
  assert.strictEqual(yuanToFen(29.9), 2990);
  assert.strictEqual(yuanToFen('99'), 9900);
  assert.strictEqual(yuanToFen('0.01'), 1);
  // 换算后与整数分还有偏差 ⇒ 压根不是"元"这种钱
  assert.ok(Number.isNaN(yuanToFen('29.999')));
  assert.ok(Number.isNaN(yuanToFen('')));
  assert.ok(Number.isNaN(yuanToFen('  ')));
  assert.ok(Number.isNaN(yuanToFen(null)));
  assert.ok(Number.isNaN(yuanToFen(undefined)));
  assert.ok(Number.isNaN(yuanToFen(NaN)));
  assert.ok(Number.isNaN(yuanToFen({})), '对象不许被 Number() 蒙混过关');
  assert.ok(Number.isNaN(yuanToFen([])));
  // 订单侧宽松到能吃 '1e3'（这种值只可能来自自家库里那一列，通知侧不在这条路上）
  assert.strictEqual(yuanToFen('1e3'), 100000);
});

test('实付金额是否可信：通知侧恒为正整数分，差一分也不算付过', () => {
  assert.strictEqual(isPaidAmountTrusted(2990, '29.90'), true);
  assert.strictEqual(isPaidAmountTrusted(2990, 29.9), true);
  assert.strictEqual(isPaidAmountTrusted(1, '0.01'), true);
  // 2990 vs 29.91 少一分都不能入账
  assert.strictEqual(isPaidAmountTrusted(2990, '29.91'), false);
  assert.strictEqual(isPaidAmountTrusted(2991, '29.90'), false);
  // 通知侧刻意从严：正常微信报文里 amount.total 恒为正整数，
  // 出现字符串 / null / 小数 / 0 / 负数就说明这条不是自家下单产生的
  assert.strictEqual(isPaidAmountTrusted('2990', '29.90'), false);
  assert.strictEqual(isPaidAmountTrusted(2990.5, '29.90'), false);
  assert.strictEqual(isPaidAmountTrusted(0, '0.00'), false);
  assert.strictEqual(isPaidAmountTrusted(-2990, '29.90'), false);
  assert.strictEqual(isPaidAmountTrusted(null, '29.90'), false);
  assert.strictEqual(isPaidAmountTrusted(undefined, '29.90'), false);
  // 订单值取不到也不能算通过（宁可拒单）
  assert.strictEqual(isPaidAmountTrusted(2990, null), false);
  assert.strictEqual(isPaidAmountTrusted(2990, ''), false);
});

test('通知身份：同一把 APIv3 密钥可能被多个 appid 复用，不比对身份就会把别处的支付算到本站', () => {
  assert.strictEqual(isNotifyAddressedToUs(GOOD, CONFIG), true);
  assert.strictEqual(isNotifyAddressedToUs({ ...GOOD, appid: '别的-app' }, CONFIG), false);
  assert.strictEqual(isNotifyAddressedToUs({ ...GOOD, mchid: '别的-商户' }, CONFIG), false);
  assert.strictEqual(isNotifyAddressedToUs({ ...GOOD, appid: undefined }, CONFIG), false);
  assert.strictEqual(isNotifyAddressedToUs(null, CONFIG), false);
  assert.strictEqual(isNotifyAddressedToUs('字符串', CONFIG), false);
  // 本站没配全 ⇒ 判不可信（配置不全是根本下不了单的，不存在误伤正常用户那条路）
  assert.strictEqual(isNotifyAddressedToUs(GOOD, {}), false);
  assert.strictEqual(isNotifyAddressedToUs(GOOD, { appId: 'wx-app-0001' }), false);
  assert.strictEqual(isNotifyAddressedToUs(GOOD, null), false);
});

test('外层 event_type 说成功不算成功：只认 trade_state', () => {
  assert.strictEqual(isTradeSuccess(GOOD), true);
  assert.strictEqual(isTradeSuccess({ ...GOOD, trade_state: 'REFUND' }), false);
  assert.strictEqual(isTradeSuccess({ ...GOOD, trade_state: 'CLOSED' }), false);
  assert.strictEqual(
    isTradeSuccess({ ...GOOD, trade_state: 'success' }),
    false,
    '大小写要逐字对上',
  );
  assert.strictEqual(
    isTradeSuccess({ ...GOOD, event_type: 'TRANSACTION.SUCCESS', trade_state: undefined }),
    false,
  );
  assert.strictEqual(isTradeSuccess(null), false);
});

test('日志字段消毒：只放标量，换行去掉，长值截短（通知原文带密文与签名串）', () => {
  assert.strictEqual(safeLogValue(null), 'null');
  assert.strictEqual(safeLogValue(undefined), 'undefined');
  assert.strictEqual(safeLogValue(2990), '2990');
  assert.strictEqual(safeLogValue(false), 'false');
  assert.strictEqual(safeLogValue('ord_1'), 'ord_1');
  assert.strictEqual(safeLogValue('a\r\nb\tc'), 'abc', '换行进日志就能伪造出一整行别的记录');
  assert.strictEqual(safeLogValue('x'.repeat(100)).length, 64);
  assert.strictEqual(safeLogValue({ ciphertext: '秘密' }), '[不支持的类型]');
  assert.strictEqual(safeLogValue(['a']), '[不支持的类型]');
});

test('入账前的统一体检：顺序是状态 → 身份 → 金额，拒了要带能 grep 的理由', () => {
  assert.deepStrictEqual(
    screenWechatNotify({ payload: GOOD, order: { amount: '29.90' }, config: CONFIG }),
    { ok: true },
  );

  const bad = (payload, order, config) => screenWechatNotify({ payload, order, config });

  let r = bad(null, { amount: '29.90' }, CONFIG);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, '通知内容不是合法对象');

  r = bad({ ...GOOD, trade_state: 'REFUND' }, { amount: '29.90' }, CONFIG);
  assert.strictEqual(r.reason, '交易状态非 SUCCESS');

  r = bad({ ...GOOD, appid: '别的' }, { amount: '29.90' }, CONFIG);
  assert.strictEqual(r.reason, '通知 appid/mchid 与本站配置不符');

  r = bad(GOOD, { amount: '99.00' }, CONFIG);
  assert.strictEqual(r.reason, '回调金额与订单应收不符');

  r = bad(GOOD, null, CONFIG);
  assert.strictEqual(r.reason, '回调金额与订单应收不符', '订单查不到时金额判据先挡下，别放行进账');

  // 日志侧只留标量与该看的字段：这几项直接进服务器日志
  const withLog = bad(GOOD, { amount: '99.00' }, CONFIG);
  assert.deepStrictEqual(withLog.log, {
    orderId: 'ord_1',
    notifyFen: '2990',
    expectFen: '9900',
    notifyAppid: 'wx-app-0001',
    notifyMchid: 'mch-0001',
  });
});

test('后台改价只认「最多两位小数的元」：范围 0.01 ～ 99999.99', () => {
  assert.deepStrictEqual(parseAmountYuan('29.9'), { ok: true, fen: 2990 });
  assert.deepStrictEqual(parseAmountYuan('99'), { ok: true, fen: 9900 });
  assert.deepStrictEqual(
    parseAmountYuan(' 29.90 '),
    { ok: true, fen: 2990 },
    '前后空格是表单常带的',
  );
  assert.deepStrictEqual(parseAmountYuan('0.01'), { ok: true, fen: 1 });
  assert.deepStrictEqual(parseAmountYuan('99999.99'), { ok: true, fen: 9999999 }, '上限本身含得住');

  assert.strictEqual(parseAmountYuan('29.999').ok, false);
  assert.match(parseAmountYuan('29.999').error, /两位小数/);
  assert.strictEqual(parseAmountYuan('.5').ok, false, '缺整数位的写法不收');
  assert.strictEqual(parseAmountYuan('0').ok, false);
  assert.strictEqual(parseAmountYuan('100000').ok, false);
  assert.strictEqual(parseAmountYuan('-5').ok, false);
  assert.strictEqual(parseAmountYuan('abc').ok, false);
  assert.strictEqual(parseAmountYuan('').ok, false);
  assert.strictEqual(parseAmountYuan(undefined).ok, false);
  assert.strictEqual(parseAmountYuan({}).ok, false, '对象会被 String() 成 [object Object]，也该拒');
});

test('四项收费的键名钉住：改名要连着改库里的 admin_settings，不是改这里就完事', () => {
  assert.deepStrictEqual(itemNames(), ['deposit', 'contactUnlock', 'contactPack3', 'contactPack5']);
});
