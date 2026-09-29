// ============================================================
// 收价配置：金额存在 admin_settings 里，后台可直接改，不用动代码
// ============================================================
//
// 一律以「分」为单位存整数字符串、读出来再换算成元，避免用浮点存钱。
// 下单用的两档默认值取自环境变量（或 29.9 / 9.9 的硬编码兜底），保证金拆分三档
// 没有环境变量、默认值就写死在下面。这些默认只在那张表还没有对应记录时生效 ——
// 后台改过一次之后，环境变量就不再是权威来源了。

const adminDb = require('../db/admin.js');
const { yuanToFen } = require('./payment-verify.js');

const ITEMS = {
  deposit: { key: 'deposit_amount_fen', field: 'deposit_amount', label: '保证金', defaultFen: yuanToFen(process.env.DEPOSIT_AMOUNT) || 2990 },
  contactUnlock: { key: 'contact_unlock_amount_fen', field: 'contact_unlock_amount', label: '查看联系方式', defaultFen: yuanToFen(process.env.CONTACT_UNLOCK_AMOUNT) || 990 },
  // 下面三档是「一笔保证金怎么分」，只在保证金规则页展示，不参与下单金额计算。
  // 三档之和必须等于保证金（默认 9.9 + 10 + 10 = 29.9），这条由 splitCheck 在保存时挡。
  platformFee: { key: 'platform_fee_fen', field: 'platform_fee', label: '平台运营费', defaultFen: 990 },
  emotionalDamage: { key: 'emotional_damage_fen', field: 'emotional_damage', label: '感情损失费', defaultFen: 1000 },
  deleteRefund: { key: 'delete_refund_fen', field: 'delete_refund', label: '删除可退', defaultFen: 1000 },
};

const SPLIT_ITEMS = ['platformFee', 'emotionalDamage', 'deleteRefund'];

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

/**
 * 保证金三档拆分之和必须等于保证金，否则规则页上写的分配对不上真实标价。
 * overrides 传本轮**准备写入**的分值；没给的档按现值参与计算——所以改保证金那一笔
 * 必须把三档一起送上来，否则这里会拦下来（宁可挡着不写，也不留下对不上账的规则页）。
 */
async function splitCheck(overrides = {}) {
  const fenOf = async (name) => (overrides[name] !== undefined ? overrides[name] : await getAmountFen(name));
  const deposit = await fenOf('deposit');
  let sum = 0;
  for (const name of SPLIT_ITEMS) sum += await fenOf(name);
  return { ok: sum === deposit, deposit, sum };
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
  SPLIT_ITEMS,
  itemNames,
  getAmountFen,
  getYuan,
  parseAmountYuan,
  setAmountFen,
  setAmountYuan,
  splitCheck,
  describeAll,
  publicView,
};
