/**
 * match.service 单元测试
 * 测试：多条件匹配逻辑、分数计算、排序
 */

import { describe, it, expect } from 'vitest'
import { matchRows } from './match.service'
import type { Row, MatchCondition } from '../data/types'

// 测试用用户数据
const makeRow = (id: string, data: Partial<Row['data']>): Row => ({
  id,
  deposit: 29.9,
  createdAt: Date.now(),
  data: {
    name: '',
    gender: '',
    age: '',
    height: '',
    weight: '',
    skinTone: '',
    zodiac: '',
    bloodType: '',
    city: '',
    marriage: '',
    children: '',
    education: '',
    job: '',
    income: '',
    house: '',
    car: '',
    faceType: '',
    eyeType: '',
    mouthType: '',
    bodyType: '',
    hobbies: '',
    food: '',
    sport: '',
    music: '',
    smoke: '',
    drink: '',
    religion: '',
    pet: '',
    personality: '',
    expectation: '',
    contact: '',
    interestTags: '',
    purpose: '',
    ...data,
  },
})

describe('matchRows', () => {
  it('无条件时返回所有用户', () => {
    const rows = [makeRow('r1', { name: '小雅' }), makeRow('r2', { name: '明月' })]
    const result = matchRows(rows, [])
    expect(result).toHaveLength(2)
  })

  it('空条件时返回所有用户', () => {
    const rows = [makeRow('r1', { name: '小雅' })]
    const result = matchRows(rows, [{ column: '', value: '' }])
    expect(result).toHaveLength(1)
  })

  it('单个精确匹配', () => {
    const rows = [
      makeRow('r1', { gender: '女', city: '西安' }),
      makeRow('r2', { gender: '男', city: '北京' }),
    ]
    const conditions: MatchCondition[] = [{ column: 'gender', value: '女' }]
    const result = matchRows(rows, conditions)
    expect(result).toHaveLength(1)
    expect(result[0].row.id).toBe('r1')
    expect(result[0].score).toBe(1)
  })

  it('包含匹配（模糊搜索）', () => {
    const rows = [makeRow('r1', { hobbies: '看书,摄影' }), makeRow('r2', { hobbies: '游戏,动漫' })]
    const conditions: MatchCondition[] = [{ column: 'hobbies', value: '摄影' }]
    const result = matchRows(rows, conditions)
    expect(result).toHaveLength(1)
    expect(result[0].row.id).toBe('r1')
  })

  it('年龄范围匹配', () => {
    const rows = [
      makeRow('r1', { age: 25 }),
      makeRow('r2', { age: 30 }),
      makeRow('r3', { age: 35 }),
    ]
    const conditions: MatchCondition[] = [{ column: 'age', value: '25-30' }]
    const result = matchRows(rows, conditions)
    expect(result).toHaveLength(2)
    const ids = result.map((r) => r.row.id).sort()
    expect(ids).toEqual(['r1', 'r2'])
  })

  it('年龄大于匹配', () => {
    const rows = [makeRow('r1', { age: 20 }), makeRow('r2', { age: 30 })]
    const conditions: MatchCondition[] = [{ column: 'age', value: '>25' }]
    const result = matchRows(rows, conditions)
    expect(result).toHaveLength(1)
    expect(result[0].row.id).toBe('r2')
  })

  it('年龄小于匹配', () => {
    const rows = [makeRow('r1', { age: 20 }), makeRow('r2', { age: 30 })]
    const conditions: MatchCondition[] = [{ column: 'age', value: '<25' }]
    const result = matchRows(rows, conditions)
    expect(result).toHaveLength(1)
    expect(result[0].row.id).toBe('r1')
  })

  it('多条件全部匹配才返回', () => {
    const rows = [
      makeRow('r1', { gender: '女', city: '西安', education: '本科' }),
      makeRow('r2', { gender: '女', city: '北京', education: '本科' }),
      makeRow('r3', { gender: '男', city: '西安', education: '本科' }),
    ]
    const conditions: MatchCondition[] = [
      { column: 'gender', value: '女' },
      { column: 'city', value: '西安' },
    ]
    const result = matchRows(rows, conditions)
    expect(result).toHaveLength(1)
    expect(result[0].row.id).toBe('r1')
    expect(result[0].score).toBe(2)
  })

  it('按分数降序排列（全部匹配时才返回）', () => {
    const rows = [
      makeRow('r1', { gender: '女', city: '西安', education: '本科' }),
      makeRow('r2', { gender: '女', city: '北京', education: '本科' }),
      makeRow('r3', { gender: '女', city: '北京', hobbies: '本科相关' }),
    ]
    const conditions: MatchCondition[] = [
      { column: 'gender', value: '女' },
      { column: 'education', value: '本科' },
    ]
    const result = matchRows(rows, conditions)
    // matchRows 要所有条件都满足才返回，r3 的 education 不含 "本科"，被过滤
    expect(result).toHaveLength(2)
    // r1 和 r3 都满足 2 个条件
    expect(result[0].score).toBe(2)
    expect(result[1].score).toBe(2)
  })

  it('匹配结果包含 matches 详情', () => {
    const rows = [makeRow('r1', { gender: '女', city: '西安' })]
    const conditions: MatchCondition[] = [
      { column: 'gender', value: '女' },
      { column: 'city', value: '西安' },
    ]
    const result = matchRows(rows, conditions)
    expect(result[0].matches).toEqual(['gender:女', 'city:西安'])
  })

  it('匹配不区分大小写', () => {
    const rows = [makeRow('r1', { city: "XI'AN" })]
    const conditions: MatchCondition[] = [{ column: 'city', value: 'xi' }]
    const result = matchRows(rows, conditions)
    expect(result).toHaveLength(1)
  })

  it('无匹配用户时返回空数组', () => {
    const rows = [makeRow('r1', { gender: '男' })]
    const conditions: MatchCondition[] = [{ column: 'gender', value: '女' }]
    const result = matchRows(rows, conditions)
    expect(result).toHaveLength(0)
  })

  it('data 字段缺失时不崩溃', () => {
    const rows = [{ id: 'r1', deposit: 29.9, createdAt: Date.now() } as Row]
    const conditions: MatchCondition[] = [{ column: 'gender', value: '女' }]
    const result = matchRows(rows, conditions)
    // 没匹配到 gender 所以不会返回
    expect(result).toHaveLength(0)
  })

  // 首页那句提示写着「多项选择可用逗号分隔」，多选下拉也真会把几个值拼成 "火锅,烧烤" 存进条件；
  // 改前这里只按整串 includes，等于要求资料格子里原样出现那串逗号写法 ⇒ 多选基本全筛空
  it('逗号分隔的多选值：任一个命中就算命中（或），整串比对的时代结束了', () => {
    const rows = [
      makeRow('r1', { food: '火锅,小吃,快餐,下午茶' }),
      makeRow('r2', { food: '川菜,烧烤' }),
      makeRow('r3', { food: '粤菜,西餐,日料' }),
    ]
    const conditions: MatchCondition[] = [{ column: 'food', value: '火锅,烧烤' }]
    const result = matchRows(rows, conditions)
    console.log('[匹配] food="火锅,烧烤" 命中 =', JSON.stringify(result.map((r) => r.row.id)))
    expect(result.map((r) => r.row.id).sort()).toEqual(['r1', 'r2'])
    // 一个条件里勾几项，分数仍是 1（条件计数，不是勾选项计数）
    expect(result[0].score).toBe(1)
  })

  it('中文逗号同样当多选分隔符，并且不炸空值', () => {
    const rows = [makeRow('r1', { city: '西安' }), makeRow('r2', { city: '成都' })]
    expect(
      matchRows(rows, [{ column: 'city', value: '西安，成都' }])
        .map((r) => r.row.id)
        .sort(),
    ).toEqual(['r1', 'r2'])
    expect(matchRows(rows, [{ column: 'city', value: '西安,' }]).map((r) => r.row.id)).toEqual([
      'r1',
    ])
  })

  it('多选与其它条件之间仍是「且」', () => {
    const rows = [
      makeRow('r1', { gender: '女', food: '火锅,小吃' }),
      makeRow('r2', { gender: '男', food: '川菜,烧烤' }),
      makeRow('r3', { gender: '女', food: '粤菜,西餐' }),
    ]
    const conditions: MatchCondition[] = [
      { column: 'gender', value: '女' },
      { column: 'food', value: '火锅,烧烤' },
    ]
    const result = matchRows(rows, conditions)
    expect(result.map((r) => r.row.id)).toEqual(['r1'])
    expect(result[0].score).toBe(2)
  })

  it('年龄的比较写法不受逗号分支影响', () => {
    const rows = [makeRow('r1', { age: 20 }), makeRow('r2', { age: 30 })]
    expect(matchRows(rows, [{ column: 'age', value: '>25' }]).map((r) => r.row.id)).toEqual(['r2'])
    expect(matchRows(rows, [{ column: 'age', value: '20-30' }])).toHaveLength(2)
  })
})
