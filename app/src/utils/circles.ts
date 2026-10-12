import type { Row } from '../data/types'

/**
 * 圈子分组：资料里的兴趣/美食/运动/音乐/城市/性格六列，把真实出现过的词都算成圈子。
 *
 * 为什么要改：圈子页以前只遍历下面 CIRCLE_TAG_MAP 里写死的那几十个标签，
 * 标签以外的人在前台根本不存在。2026-10-13 拿本机线上同款库（可见 283 行）实测：
 *   兴趣圈 16 个标签只接住 223 行里的 118 行；性格圈 9 个只接住 202 行里的 45 行；
 *   同城圈 12 个城市，库里可见城市值有 47 个，112 行（占四成）没圈子可进。
 * 现在分成两步：写死的标签仍然优先（它负责把「西安高新区」并进「西安」这种大圈），
 * 剩下没人接的人按资料里真实的词各归各圈，保证只要填了就一定在某个圈子里看得见。
 */

export const CIRCLE_TAG_MAP: Record<string, string[]> = {
  hobbies: [
    '动漫',
    '游戏',
    '摄影',
    '旅行',
    '看书',
    '电影',
    '音乐',
    '绘画',
    '手工',
    '露营',
    '徒步',
    '桌游',
    '剧本杀',
    'K歌',
    '跳舞',
    '乐器',
    '科技',
    '编程',
  ],
  food: ['火锅', '烧烤', '川菜', '粤菜', '日料', '西餐', '韩餐', '甜品', '海鲜', '咖啡', '奶茶'],
  sport: ['跑步', '游泳', '篮球', '足球', '羽毛球', '网球', '瑜伽', '健身', '骑行', '登山', '滑雪'],
  music: ['流行', '摇滚', '民谣', '古典', '爵士', '电子', 'R&B', '嘻哈', '古风', '轻音乐', '说唱'],
  city: [
    '北京',
    '上海',
    '广州',
    '深圳',
    '杭州',
    '成都',
    '武汉',
    '南京',
    '西安',
    '重庆',
    '苏州',
    '长沙',
  ],
  personality: ['温柔', '开朗', '内向', '幽默', '沉稳', '活泼', '直爽', '细腻', '独立', '随和'],
}

export interface CircleGroup {
  tag: string
  count: number
  users: Row[]
}

// 资料列是自由文本，用户手打的可能是中文逗号、顿号、分号、竖线或斜杠；
// 详情页「TA的圈子」那排标签按逗号拆，这里拆口径必须和它一致，否则点进去人数会变。
const TAG_SEPARATOR = /[,，、;；|/]+/

export function splitTagTokens(value: string): string[] {
  return Array.from(
    new Set(
      String(value || '')
        .split(TAG_SEPARATOR)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  )
}

function rawValue(row: Row, fieldKey: string): string {
  return String(row.data?.[fieldKey as keyof NonNullable<Row['data']>] ?? '').trim()
}

export function buildCircleGroups(rows: Row[], fieldKey: string): CircleGroup[] {
  const withValue = rows.filter((r) => rawValue(r, fieldKey) !== '')
  const configured = CIRCLE_TAG_MAP[fieldKey] || []
  const groups: CircleGroup[] = []
  const configuredNames = new Set<string>()

  for (const tag of configured) {
    const users = withValue.filter((r) => rawValue(r, fieldKey).includes(tag))
    if (users.length === 0) continue
    configuredNames.add(tag)
    groups.push({ tag, count: users.length, users })
  }

  const byToken = new Map<string, Row[]>()
  for (const row of withValue) {
    for (const token of splitTagTokens(rawValue(row, fieldKey))) {
      // 和写死标签重名的词不再单开一圈：那一圈用子串匹配，人已经更全
      if (configuredNames.has(token)) continue
      const bucket = byToken.get(token)
      if (bucket) bucket.push(row)
      else byToken.set(token, [row])
    }
  }
  for (const [tag, users] of byToken) groups.push({ tag, count: users.length, users })

  // 人多的排前面；人数相同时写死标签在前，派生词按出现顺序
  const rank = new Map(configured.map((t, i) => [t, i]))
  groups.sort(
    (a, b) =>
      b.count - a.count ||
      (rank.get(a.tag) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.tag) ?? Number.MAX_SAFE_INTEGER),
  )
  return groups
}

/**
 * 圈子里的成员：列表页和详情页必须用同一个口径算人，
 * 否则卡片上写「潜水 29人」，点进去变成 30 人（或反过来空一片）。
 */
export function pickCircleMembers(rows: Row[], fieldKey: string, tag: string): Row[] {
  const key = String(tag || '').trim()
  if (!key) return []
  const exact = buildCircleGroups(rows, fieldKey).find((g) => g.tag === key)
  if (exact) return exact.users
  // 链接可能是手输的或来自旧缓存：退一步按子串找人，宁可多不可空
  return rows.filter((r) => rawValue(r, fieldKey).includes(key))
}
