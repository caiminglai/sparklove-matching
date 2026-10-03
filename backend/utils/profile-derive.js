/**
 * 资料字段的派生计算 —— 表单不再追问的那些项，在写库前由更基础的答案算出来。
 *
 * 为什么放在写库前统一算：年龄区间筛选（db/users.js 的 CAST(age AS INTEGER)、首页 match.service
 * 的范围条件）、访客详情页展示、匹配向量文本（services/vector.service.js）都是按这几个键读值的，
 * 只把题目从表单里删掉会让它们一起变空。
 *
 * 纯函数、零依赖，与 utils/payment-verify.js 同口径：前端测试目录可用 createRequire 直接拉这份源文件测。
 */

// 星座按公历"起始日"表定：早于 1/20 的都落在上一档摩羯座里。
const ZODIAC_BOUNDS = [
  { month: 1, day: 20, name: '水瓶座' },
  { month: 2, day: 19, name: '双鱼座' },
  { month: 3, day: 21, name: '白羊座' },
  { month: 4, day: 20, name: '金牛座' },
  { month: 5, day: 21, name: '双子座' },
  { month: 6, day: 22, name: '巨蟹座' },
  { month: 7, day: 23, name: '狮子座' },
  { month: 8, day: 23, name: '处女座' },
  { month: 9, day: 23, name: '天秤座' },
  { month: 10, day: 24, name: '天蝎座' },
  { month: 11, day: 23, name: '射手座' },
  { month: 12, day: 22, name: '摩羯座' },
];

// 生日这一栏历史上就是自由文本（字段说明写的是"如1995-06或19950615"），所以解析要容忍分隔符与年月日缺项。
function parseBirthday(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  const nums = s.match(/\d+/g);
  if (!nums || !nums.length) return null;

  let year = null;
  let month = null;
  let day = null;

  // 紧凑写法 19950615 / 199506：数字串直接按位切
  if (nums.length === 1 && nums[0].length >= 6) {
    const digits = nums[0];
    year = Number(digits.slice(0, 4));
    month = Number(digits.slice(4, 6));
    if (digits.length >= 8) day = Number(digits.slice(6, 8));
  } else {
    const parts = nums.map(Number);
    // 首段是 4 位才算年；否则当成"只有月日"（1995-06 允许缺日，06-15 允许缺年）
    if (String(nums[0]).length === 4) {
      year = parts[0];
      month = parts.length > 1 ? parts[1] : null;
      day = parts.length > 2 ? parts[2] : null;
    } else {
      month = parts[0];
      day = parts.length > 1 ? parts[1] : null;
    }
  }

  const nowYear = new Date().getFullYear();
  if (year != null && (year < 1900 || year > nowYear)) return null;
  if (month != null && (month < 1 || month > 12)) return null;
  if (day != null && (day < 1 || day > 31)) return null;
  return { year, month, day };
}

/** 周岁；只有年份时按 1 月 1 日出生计，误差最多 1 岁，只影响年龄筛选的边界。 */
function deriveAgeFromBirthday(rawBirthday, nowMs = Date.now()) {
  const b = parseBirthday(rawBirthday);
  if (!b || b.year == null) return '';
  const now = new Date(nowMs);
  const month = b.month == null ? 1 : b.month;
  const day = b.day == null ? 1 : b.day;
  let age = now.getFullYear() - b.year;
  // 生日没带日时按当月 1 日计：当前月等于出生月且还没过 1 日，才判"今年生日未到"
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1;
  if (age < 0 || age > 120) return '';
  return String(age);
}

/** 需要月与日都在才算：1995-06 这种只到月份的写法跨两个星座，硬给一个反而错。 */
function deriveZodiacFromBirthday(rawBirthday) {
  const b = parseBirthday(rawBirthday);
  if (!b || b.month == null || b.day == null) return '';
  let name = '摩羯座';
  for (const bound of ZODIAC_BOUNDS) {
    if (b.month > bound.month || (b.month === bound.month && b.day >= bound.day)) name = bound.name;
  }
  return name;
}

// 婚姻状况原本只有 未婚/离异/丧偶 三档，连"已婚"都表达不了；感情状态是它的细分，所以由后者反推。
function deriveMarriageFromRelationshipStatus(status) {
  const s = String(status == null ? '' : status).trim();
  if (s === '离异') return '离异';
  if (s === '丧偶') return '丧偶';
  if (s === '已婚') return '已婚';
  if (s === '单身' || s === '暧昧中' || s === '恋爱中') return '未婚';
  // 不想透露或表里没有的写法：不派生，别把猜的写成事实
  return '';
}

/** 兴趣标签这一项历史上就是"兴趣爱好 + 运动爱好"两个列表的并集，逐项自己填等于填两遍。 */
function deriveInterestTags(hobbies, sport) {
  const split = (v) =>
    String(v == null ? '' : v)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  const merged = split(hobbies);
  for (const tag of split(sport)) if (!merged.includes(tag)) merged.push(tag);
  return merged.join(',');
}

/**
 * 只覆盖"算得出来"的那几项：算不出（缺来源）时保留提交上来的原值，
 * 免得老用户没填生日就把已有的年龄抹成空。
 * 唯一例外是 age/zodiac —— 提交里带了 birthday 时按生日整体重算，算不出就写空。
 */
function deriveProfileFields(data, nowMs = Date.now()) {
  const out = { ...(data || {}) };
  const setIfDerived = (key, value) => {
    if (value !== '' && value != null) out[key] = value;
  };
  // 生日栏由表单下拉直接控制，所以提交里带了它就完全以它为准：
  // 把 1995-06-22 改成 1995-06（日留空）时星座算不出来，必须把旧的巨蟹座抹掉，
  // 否则页面上会留下一个对不上生日的星座，而这栏已从表单里隐藏、用户自己清不掉。
  // 没带 birthday 的提交保持原来的"算得出才覆盖"，免得把只写了年龄的老数据抹成空。
  if (Object.prototype.hasOwnProperty.call(out, 'birthday')) {
    out.age = deriveAgeFromBirthday(out.birthday, nowMs);
    out.zodiac = deriveZodiacFromBirthday(out.birthday);
  } else {
    setIfDerived('age', deriveAgeFromBirthday(out.birthday, nowMs));
    setIfDerived('zodiac', deriveZodiacFromBirthday(out.birthday));
  }
  setIfDerived('marriage', deriveMarriageFromRelationshipStatus(out.relationship_status));
  const tags = deriveInterestTags(out.hobbies, out.sport);
  if (tags !== '') out.interestTags = tags;
  return out;
}

module.exports = {
  parseBirthday,
  deriveAgeFromBirthday,
  deriveZodiacFromBirthday,
  deriveMarriageFromRelationshipStatus,
  deriveInterestTags,
  deriveProfileFields,
};
