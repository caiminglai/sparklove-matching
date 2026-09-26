/**
 * profile-completeness 单元测试
 * 覆盖：全空 / 部分填 / 脏占位值 / 纯空格 / null+undefined，并打印每组真实返回值
 */

import { describe, it, expect } from 'vitest'
import {
  PROFILE_COMPLETENESS_FIELDS,
  computeProfileCompleteness,
  isFieldFilled,
} from './profile-completeness'

function show(title: string, input: unknown, result: unknown) {
  console.log(
    `[完整度] ${title}\n  输入: ${JSON.stringify(input)}\n  返回: ${JSON.stringify(result)}`,
  )
}

describe('computeProfileCompleteness', () => {
  it('分母是 5 个门面字段，且不含任何红线字段', () => {
    const keys = PROFILE_COMPLETENESS_FIELDS.map((f) => f.key)
    console.log('[完整度] 参与统计字段 =', JSON.stringify(keys))
    expect(keys).toEqual(['avatar', 'name', 'gender', 'city', 'job'])
    expect(keys).not.toContain('contact')
    expect(keys.some((k) => /(phone|email|idcard|realname|password|token)/i.test(k))).toBe(false)
  })

  it('全空（含 undefined / null 入参）', () => {
    const a = computeProfileCompleteness({})
    const b = computeProfileCompleteness(null)
    const c = computeProfileCompleteness(undefined)
    const d = computeProfileCompleteness({
      avatar: undefined,
      name: null,
      gender: undefined,
      city: null,
      job: undefined,
    })
    show('空对象 {}', {}, a)
    show('null', null, b)
    show('undefined', undefined, c)
    show('全是 null/undefined', '见输入', d)
    expect(a).toEqual({
      filled: 0,
      total: 5,
      ratio: 0,
      percent: 0,
      missing: ['头像', '昵称', '性别', '城市', '职业'],
    })
    expect(b.filled).toBe(0)
    expect(c.filled).toBe(0)
    expect(d.filled).toBe(0)
  })

  it('部分填写（3/5，city 空串 + job 纯空格视为未填）', () => {
    const input = { avatar: '/uploads/a.png', name: '小美', gender: '女', city: '', job: '   ' }
    const r = computeProfileCompleteness(input)
    show('3/5（city 空串、job 纯空格）', input, r)
    expect(r).toEqual({ filled: 3, total: 5, ratio: 0.6, percent: 60, missing: ['城市', '职业'] })
  })

  it('脏占位值不算已填（"null" / "[]" / "{}" / "undefined" / "-"）', () => {
    const input = { avatar: 'null', name: '[]', gender: '{}', city: 'undefined', job: '-' }
    const r = computeProfileCompleteness(input)
    show('五个字段全是脏字符串', input, r)
    expect(r.filled).toBe(0)
    expect(r.percent).toBe(0)
  })

  it('纯空格 / 数字 0 都不算已填，正常数字算已填', () => {
    expect(isFieldFilled('')).toBe(false)
    expect(isFieldFilled('    ')).toBe(false)
    expect(isFieldFilled(' null ')).toBe(false)
    expect(isFieldFilled(0)).toBe(false)
    expect(isFieldFilled(NaN)).toBe(false)
    expect(isFieldFilled(28)).toBe(true)
    expect(isFieldFilled([])).toBe(false)
    expect(isFieldFilled(['旅行'])).toBe(true)
    const input = {
      avatar: 'data:image/png;base64,AAAA',
      name: '阿哲',
      gender: 0,
      city: '  ',
      job: '程序员',
    }
    const r = computeProfileCompleteness(input)
    show('gender=0 / city=空格 / job=正常', input, r)
    expect(r).toEqual({ filled: 3, total: 5, ratio: 0.6, percent: 60, missing: ['性别', '城市'] })
  })

  it('满值 5/5', () => {
    const input = {
      avatar: '/uploads/x.png',
      name: '小美',
      gender: '女',
      city: '杭州',
      job: '设计师',
    }
    const r = computeProfileCompleteness(input)
    show('全填', input, r)
    expect(r).toEqual({ filled: 5, total: 5, ratio: 1, percent: 100, missing: [] })
  })
})
