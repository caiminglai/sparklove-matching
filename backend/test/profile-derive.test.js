// ============================================================
// 资料派生：表单不再追问的那几项，写库前由更基础的答案算出来
//
// 这几条是本站的业务口径（10-30 现量：生日栏自由文本、星座按公历起始日表、
// 婚姻状况由感情状态反推、兴趣标签是"兴趣爱好+运动爱好"并集）。
// 年龄区间筛选、访客详情页、匹配向量文本都按这几个键读值，
// 所以派生算错的代价不是"少显示一项"，是筛出来的人不对。
// 现在时间一律传进来（deriveAgeFromBirthday/deriveProfileFields 的第二参），
// 免得这份测试在生日当天跨点时自己变红。
// ============================================================
require('./helpers/env');

const test = require('node:test');
const assert = require('node:assert');

const {
  parseBirthday,
  deriveAgeFromBirthday,
  deriveZodiacFromBirthday,
  deriveMarriageFromRelationshipStatus,
  deriveInterestTags,
  deriveProfileFields,
} = require('../utils/profile-derive');

// 2026-10-30T12:00:00（本机时区）当"现在"，下面所有年龄都对齐这一格
const NOW = new Date(2026, 9, 30, 12, 0, 0).getTime();

test('生日是自由文本：分隔符、缺项、紧凑写法都要容得下，非法值宁可不解析', () => {
  assert.deepStrictEqual(parseBirthday('1995-06'), { year: 1995, month: 6, day: null });
  assert.deepStrictEqual(parseBirthday('1995-06-15'), { year: 1995, month: 6, day: 15 });
  assert.deepStrictEqual(parseBirthday('1995/6/15'), { year: 1995, month: 6, day: 15 });
  assert.deepStrictEqual(parseBirthday('19950615'), { year: 1995, month: 6, day: 15 });
  assert.deepStrictEqual(parseBirthday('199506'), { year: 1995, month: 6, day: null });
  assert.deepStrictEqual(parseBirthday('1995'), { year: 1995, month: null, day: null });
  assert.deepStrictEqual(parseBirthday('06-15'), { year: null, month: 6, day: 15 });
  assert.deepStrictEqual(parseBirthday('  1995 . 06 . 15  '), { year: 1995, month: 6, day: 15 });

  assert.strictEqual(parseBirthday(''), null);
  assert.strictEqual(parseBirthday('   '), null);
  assert.strictEqual(parseBirthday(null), null);
  assert.strictEqual(parseBirthday(undefined), null);
  assert.strictEqual(parseBirthday(' abc '), null);
  assert.strictEqual(parseBirthday('1899-01-01'), null, '早于 1900 不收');
  assert.strictEqual(parseBirthday('2100-01-01'), null, '今年之后不收（nowYear 由系统年份定）');
  assert.strictEqual(parseBirthday('1995-13-01'), null, '没有 13 月');
  assert.strictEqual(parseBirthday('1995-06-32'), null, '没有 32 日');
  assert.strictEqual(parseBirthday('95-06'), null, '两位数的第一段当月份处理，95 月不成立');
});

test('周岁：没带月按 1 月 1 日、没带日按当月 1 日，边界当天算已过生日', () => {
  assert.strictEqual(deriveAgeFromBirthday('1995-06-15', NOW), '31');
  assert.strictEqual(deriveAgeFromBirthday('1995-12-31', NOW), '30', '今年生日还没到');
  assert.strictEqual(deriveAgeFromBirthday('1995-10-30', NOW), '31', '生日当天');
  assert.strictEqual(deriveAgeFromBirthday('1995-10-31', NOW), '30', '差一天就是差一岁');
  assert.strictEqual(deriveAgeFromBirthday('1995-10', NOW), '31', '只到月 ⇒ 按 10 月 1 日，已过');
  assert.strictEqual(deriveAgeFromBirthday('1995', NOW), '31', '只到年 ⇒ 按 1 月 1 日');
  assert.strictEqual(deriveAgeFromBirthday('2026-10-30', NOW), '0');
  assert.strictEqual(deriveAgeFromBirthday('1906-10-30', NOW), '120', '120 岁还在档内');
  assert.strictEqual(
    deriveAgeFromBirthday('1905-10-30', NOW),
    '',
    '超过 120 判算不出，别写个离谱数进库',
  );
  assert.strictEqual(deriveAgeFromBirthday('', NOW), '');
  assert.strictEqual(deriveAgeFromBirthday('乱写', NOW), '');
});

test('星座要月与日都在才算：1995-06 这种写法跨两个星座，硬给一个反而错', () => {
  assert.strictEqual(deriveZodiacFromBirthday('1995-06-22'), '巨蟹座');
  assert.strictEqual(deriveZodiacFromBirthday('1995-06-21'), '双子座');
  assert.strictEqual(deriveZodiacFromBirthday('1995-01-19'), '摩羯座', '早于 1/20 落在上一档');
  assert.strictEqual(deriveZodiacFromBirthday('1995-01-20'), '水瓶座');
  assert.strictEqual(deriveZodiacFromBirthday('1995-02-19'), '双鱼座');
  assert.strictEqual(deriveZodiacFromBirthday('1995-03-21'), '白羊座');
  assert.strictEqual(deriveZodiacFromBirthday('1995-04-20'), '金牛座');
  assert.strictEqual(deriveZodiacFromBirthday('1995-05-21'), '双子座');
  assert.strictEqual(deriveZodiacFromBirthday('1995-07-23'), '狮子座');
  assert.strictEqual(deriveZodiacFromBirthday('1995-08-23'), '处女座');
  assert.strictEqual(deriveZodiacFromBirthday('1995-09-23'), '天秤座');
  assert.strictEqual(deriveZodiacFromBirthday('1995-10-24'), '天蝎座');
  assert.strictEqual(deriveZodiacFromBirthday('1995-11-23'), '射手座');
  assert.strictEqual(deriveZodiacFromBirthday('1995-12-22'), '摩羯座');
  assert.strictEqual(deriveZodiacFromBirthday('1995-12-21'), '射手座');
  assert.strictEqual(deriveZodiacFromBirthday('06-15'), '双子座', '只带月日也算得出');
  assert.strictEqual(deriveZodiacFromBirthday('1995-06'), '', '缺日不猜');
  assert.strictEqual(deriveZodiacFromBirthday('1995'), '');
  assert.strictEqual(deriveZodiacFromBirthday(''), '');
});

test('婚姻状况由感情状态反推：表里没有的写法不派生，别把猜的写成事实', () => {
  assert.strictEqual(deriveMarriageFromRelationshipStatus('离异'), '离异');
  assert.strictEqual(deriveMarriageFromRelationshipStatus('丧偶'), '丧偶');
  assert.strictEqual(deriveMarriageFromRelationshipStatus('已婚'), '已婚');
  assert.strictEqual(deriveMarriageFromRelationshipStatus('单身'), '未婚');
  assert.strictEqual(deriveMarriageFromRelationshipStatus('暧昧中'), '未婚');
  assert.strictEqual(deriveMarriageFromRelationshipStatus('恋爱中'), '未婚');
  assert.strictEqual(deriveMarriageFromRelationshipStatus(' 单身 '), '未婚', '前后空格照常认');
  assert.strictEqual(deriveMarriageFromRelationshipStatus('不想透露'), '');
  assert.strictEqual(deriveMarriageFromRelationshipStatus(''), '');
  assert.strictEqual(deriveMarriageFromRelationshipStatus(null), '');
  assert.strictEqual(deriveMarriageFromRelationshipStatus('已育'), '');
});

test('兴趣标签 = 兴趣爱好 + 运动爱好 的并集：逐项自己填等于填两遍', () => {
  assert.strictEqual(deriveInterestTags('旅游,美食', '跑步'), '旅游,美食,跑步');
  assert.strictEqual(deriveInterestTags('旅游, 旅游 ', '旅游'), '旅游', '重复只留一个');
  assert.strictEqual(deriveInterestTags('旅游,,美食', ' , '), '旅游,美食', '空项不占位');
  assert.strictEqual(deriveInterestTags('', ''), '');
  assert.strictEqual(deriveInterestTags(null, undefined), '');
});

test('派生入口：提交里带了生日就整体重算（算不出要抹掉旧星座），没带生日不动老数据', () => {
  const fresh = deriveProfileFields({ birthday: '1995-06-22', relationship_status: '单身' }, NOW);
  assert.strictEqual(fresh.age, '31');
  assert.strictEqual(fresh.zodiac, '巨蟹座');
  assert.strictEqual(fresh.marriage, '未婚');

  // 把 1995-06-22 改成 1995-06（日留空）：星座算不出来时必须把旧的巨蟹座清掉，
  // 否则页面留一个对不上生日的星座，而这一栏已从表单隐藏、用户自己清不掉
  const cleared = deriveProfileFields({ birthday: '1995-06', age: '31', zodiac: '巨蟹座' }, NOW);
  assert.strictEqual(cleared.zodiac, '', '现量=' + JSON.stringify(cleared));
  assert.strictEqual(cleared.age, '31');

  // 只写了年龄、没填生日的老数据：这次提交不带 birthday，不许把已有年龄抹成空
  const legacy = deriveProfileFields({ age: '20', zodiac: '狮子座' }, NOW);
  assert.strictEqual(legacy.age, '20');
  assert.strictEqual(legacy.zodiac, '狮子座');

  const messy = deriveProfileFields({ birthday: '乱写', hobbies: '阅读', sport: '游泳' }, NOW);
  assert.strictEqual(messy.age, '');
  assert.strictEqual(messy.zodiac, '');
  assert.strictEqual(messy.interestTags, '阅读,游泳');

  // 没带的来源不硬写：marriage 没有 relationship_status 可依时保持原样
  const keep = deriveProfileFields({ marriage: '离异' }, NOW);
  assert.strictEqual(keep.marriage, '离异');

  assert.deepStrictEqual(deriveProfileFields(null, NOW), {});
  assert.deepStrictEqual(deriveProfileFields(undefined, NOW), {});
});

test('派生不改动提交对象本身：后面的校验还要拿原值报给用户', () => {
  const input = { birthday: '1995-06-22', hobbies: '旅游' };
  const snapshot = { ...input };
  const out = deriveProfileFields(input, NOW);
  assert.deepStrictEqual(input, snapshot);
  assert.notStrictEqual(out, input);
});
