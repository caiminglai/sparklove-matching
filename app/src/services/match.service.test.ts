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
})
