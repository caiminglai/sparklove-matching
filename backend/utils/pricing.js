// ============================================================
// 收价配置：金额存在 admin_settings 里，后台可直接改，不用动代码
// ============================================================
//
// 一律以「分」为单位存整数字符串、读出来再换算成元，避免用浮点存钱。
// 默认值：认证费与查看联系方式可被环境变量覆盖（见下两行键名），两个次数包只认硬编码。
// 这些默认只在 admin_settings 还没有对应记录时生效 —— 后台改过一次之后，环境变量就不再是权威来源了。
//
// 四项收费都是一次性服务费，付了不退，所以这里只有「收多少」，没有「怎么分」。
// 两个次数包带的 credits 是「这一笔买到几次查看联系方式」，下单时抄进 payment_orders.credits，
// 之后余额只认那列的和，改价或改包容量都不会动到已购用户的次数。

const adminDb = require('../db/admin.js');
const { yuanToFen } = require('./payment-verify.js');

const ITEMS = {
  deposit: { key: 'deposit_amount_fen', field: 'deposit_amount', label: '诚意认证费', defaultFen: yuanToFen(process.env.DEPOSIT_AMOUNT) || 2990 },
  contactUnlock: { key: 'contact_unlock_amount_fen', field: 'contact_unlock_amount', label: '查看联系方式', defaultFen: yuanToFen(process.env.CONTACT_UNLOCK_AMOUNT) || 990 },
  contactPack3: { key: 'contact_pack_3_amount_fen', field: 'contact_pack_3_amount', label: '查看联系方式·3 次包', defaultFen: 2590, credits: 3 },
  contactPack5: { key: 'contact_pack_5_amount_fen', field: 'contact_pack_5_amount', label: '查看联系方式·5 次包', defaultFen: 3990, credits: 5 },
};

const MIN_FEN = 1;
const MAX_FEN = 9999999;

function itemNames() {
  return Object.keys(ITEMS);
}

function pickFen(row, item) {
  const fen = row ? parseInt(row.value, 10) : NaN;
  return Number.isInteger(fen) && fen > 0 ? fen : item.defaultFen;
}

async function getAmountFen(name) {
  return pickFen(await adminDb.getSettingRow(ITEMS[name].key), ITEMS[name]);
}

/** 下单/入账用的金额（元）；调用方不再接受前端传来的数字 */
async function getYuan(name) {
  return (await getAmountFen(name)) / 100;
}

/** 只校验格式与范围，返回「分」，不写库 */
function parseAmountYuan(raw) {
  const value = String(raw ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    return { ok: false, error: '金额最多两位小数，例如 29.9 或 99' };
  }
  const fen = yuanToFen(value);
  if (!Number.isInteger(fen) || fen < MIN_FEN || fen > MAX_FEN) {
    return { ok: false, error: '金额需在 0.01 ～ 99999.99 元之间' };
  }
  return { ok: true, fen };
}

/** 直接按「分」落库：管理端整体校验通过后走这里，免得把分值换算回元再解析一次（浮点） */
async function setAmountFen(name, fen) {
  await adminDb.setSetting(ITEMS[name].key, String(fen));
  return { ok: true, fen };
}

async function setAmountYuan(name, raw) {
  const parsed = parseAmountYuan(raw);
  if (!parsed.ok) return parsed;
  return setAmountFen(name, parsed.fen);
}

/** 后台展示用：当前值 + 默认值 + 来源 + 上次改动时间（毫秒时间戳） */
async function describeAll() {
  const out = {};
  for (const name of itemNames()) {
    const item = ITEMS[name];
    const row = await adminDb.getSettingRow(item.key);
    const fen = pickFen(row, item);
    out[name] = {
      label: item.label,
      field: item.field,
      amount: fen / 100,
      amount_fen: fen,
      default_amount: item.defaultFen / 100,
      source: row ? 'db' : 'env',
      updated_at: row ? row.updated_at : null,
    };
  }
  return out;
}

/** 前端展示用：只有「元」为单位的数字，不暴露默认值与改动时间 */
async function publicView() {
  const out = {};
  for (const name of itemNames()) out[ITEMS[name].field] = await getYuan(name);
  return out;
}

module.exports = {
  ITEMS,
  itemNames,
  getAmountFen,
  getYuan,
  parseAmountYuan,
  setAmountFen,
  setAmountYuan,
  describeAll,
  publicView,
};
