/**
 * 填表时要隐藏的字段与标签项的点击语义。
 *
 * 为什么不直接从 field_mappings 里删掉这些行：筛选项（SearchPanel）和详情页展示
 * 都读同一个 columns 数组，删行会连"按年龄筛选"和详情页那行年龄一起消失。
 * 而这几项的值已由后端在写库前算出（backend/utils/profile-derive.js），
 * 所以只需要在填表这一处不再问，其余读路径照旧。
 */

// 生日→年龄/星座、感情状态→婚姻、兴趣+运动→兴趣标签
export const FORM_HIDDEN_KEYS: ReadonlySet<string> = new Set([
  'age',
  'zodiac',
  'marriage',
  'interestTags',
])

// 同一把尺子上的不同刻度，同时选中就写出自相矛盾的资料（"经常旅行 + 宅家不出门"）
const SINGLE_SELECT_KEYS: ReadonlySet<string> = new Set(['travel_frequency'])

/** 点标签：已选中则取消；互斥项则替换掉同项里其它已选值。 */
export function applyTagToggle(current: string[], key: string, tag: string): string[] {
  if (current.includes(tag)) return current.filter((t) => t !== tag)
  return SINGLE_SELECT_KEYS.has(key) ? [tag] : [...current, tag]
}
