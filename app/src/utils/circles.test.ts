/**
 * circles 单元测试
 * 覆盖：写死标签的大圈合并 / 标签以外真实词成圈 / 列表页与详情页人数一致 / 空标签与脏分隔符
 * 数据形状取自 2026-10-13 本机库可见成员的真实写法（逗号连写、区县级城市、单人城市）
 */

import { describe, it, expect } from 'vitest'
import type { Row } from '../data/types'
import { buildCircleGroups, pickCircleMembers, splitTagTokens } from './circles'

function row(id: string, field: string, value: string): Row {
  return {
    id,
    deposit: 29.9,
    createdAt: 1,
    data: {
      name: '圈友' + id,
      city: '',
      hobbies: '',
      personality: '',
      [field]: value,
    } as Row['data'],
  }
}

function groupOf(groups: ReturnType<typeof buildCircleGroups>, tag: string) {
  return groups.find((g) => g.tag === tag)
}

describe('splitTagTokens', () => {
  it('中英文逗号、顿号、分号、竖线、斜杠都算分隔符，并且去重去空', () => {
    console.log(
      '[圈子拆词] 结果 =',
      JSON.stringify(splitTagTokens('火锅，烧烤、甜品;奶茶|咖啡/西餐, 火锅 ')),
    )
    expect(splitTagTokens('火锅，烧烤、甜品;奶茶|咖啡/西餐, 火锅 ')).toEqual([
      '火锅',
      '烧烤',
      '甜品',
      '奶茶',
      '咖啡',
      '西餐',
    ])
  })

  it('空值与非字符串入参不炸', () => {
    expect(splitTagTokens('')).toEqual([])
    expect(splitTagTokens(undefined as unknown as string)).toEqual([])
    expect(splitTagTokens('   ')).toEqual([])
  })
})

describe('buildCircleGroups', () => {
  const rows = [
    row('1', 'city', '西安'),
    row('2', 'city', '西安高新区'),
    row('3', 'city', '贵阳'),
    row('4', 'city', ''),
    row('5', 'city', '宝鸡'),
  ]

  it('写死标签负责合并：「西安」圈住写「西安高新区」的人', () => {
    const groups = buildCircleGroups(rows, 'city')
    console.log('[圈子分组] city =', JSON.stringify(groups.map((g) => `${g.tag}:${g.count}`)))
    expect(groupOf(groups, '西安')?.count).toBe(2)
    expect(groupOf(groups, '西安高新区')?.count).toBe(1)
  })

  it('标签以外的真实城市也成圈，空城市不成圈（改前：贵阳/宝鸡在圈子页根本不存在）', () => {
    const groups = buildCircleGroups(rows, 'city')
    expect(groupOf(groups, '贵阳')?.users.map((u) => u.id)).toEqual(['3'])
    expect(groupOf(groups, '宝鸡')?.count).toBe(1)
    expect(groupOf(groups, '')).toBeUndefined()
    // 可见 5 人里 4 人有城市，4 人都进了圈；「西安高新区」既在西安大圈也在自己的小圈
    const covered = new Set(groups.flatMap((g) => g.users.map((u) => u.id)))
    console.log('[圈子分组] 有城市的行 =', JSON.stringify([...covered]))
    expect([...covered].sort()).toEqual(['1', '2', '3', '5'])
  })

  it('人多者优先排，且与写死标签重名的词不再单开一圈', () => {
    const hobbies = [
      row('1', 'hobbies', '旅行,看书'),
      row('2', 'hobbies', '看书,音乐'),
      row('3', 'hobbies', '动漫'),
    ]
    const groups = buildCircleGroups(hobbies, 'hobbies')
    const names = groups.map((g) => g.tag)
    console.log('[圈子分组] hobbies =', JSON.stringify(names))
    expect(names.filter((n) => n === '看书')).toEqual(['看书'])
    expect(groupOf(groups, '看书')?.count).toBe(2)
    expect(groups[0].count).toBeGreaterThanOrEqual(groups[groups.length - 1].count)
  })

  it('一个人多个词就同时进多个圈', () => {
    const rows2 = [row('1', 'personality', '温柔,独立'), row('2', 'personality', '独立')]
    const groups = buildCircleGroups(rows2, 'personality')
    console.log(
      '[圈子分组] personality =',
      JSON.stringify(groups.map((g) => `${g.tag}:${g.users.map((u) => u.id).join('+')}`)),
    )
    expect(groupOf(groups, '独立')?.users.map((u) => u.id)).toEqual(['1', '2'])
    expect(groupOf(groups, '温柔')?.users.map((u) => u.id)).toEqual(['1'])
  })
})

describe('pickCircleMembers', () => {
  const rows = [
    row('1', 'sport', '健身,游泳,跑步,瑜伽'),
    row('2', 'sport', '羽毛球,骑行'),
    row('3', 'sport', '潜水,帆船,游艇,高尔夫'),
  ]

  it('详情页点进去的人数＝列表页卡片上的人数（含派生词圈）', () => {
    for (const g of buildCircleGroups(rows, 'sport')) {
      expect(pickCircleMembers(rows, 'sport', g.tag).length).toBe(g.count)
    }
  })

  it('空标签返回空，不返回整张表', () => {
    expect(pickCircleMembers(rows, 'sport', '')).toEqual([])
    expect(pickCircleMembers(rows, 'sport', '  ')).toEqual([])
  })

  it('圈名不在分组里（手输/旧链接）时按子串兜底', () => {
    console.log(
      '[圈子成员] 兜底 帆 =',
      JSON.stringify(pickCircleMembers(rows, 'sport', '帆').map((r) => r.id)),
    )
    expect(pickCircleMembers(rows, 'sport', '帆').map((r) => r.id)).toEqual(['3'])
  })
})
