/**
 * 联系方式脱敏工具单元测试
 * 测试：maskContact 联系方式脱敏
 */

import { describe, it, expect } from 'vitest'
import { maskContact } from './mask'

describe('maskContact', () => {
  it('空字符串返回空', () => {
    expect(maskContact('')).toBe('')
  })

  it('11位手机号脱敏', () => {
    expect(maskContact('13812345678')).toBe('138****5678')
  })

  it('非11位字符串按前3后2脱敏', () => {
    expect(maskContact('wx_xiaoya')).toBe('wx_****ya')
  })

  it('短字符串（<=5位）也能脱敏', () => {
    expect(maskContact('abc')).toBe('abc****bc')
  })

  it('undefined/null 返回空（类型保护）', () => {
    // TypeScript 类型签名是 string，但运行时可能传入 undefined
    expect(maskContact(undefined as unknown as string)).toBe('')
    expect(maskContact(null as unknown as string)).toBe('')
  })

  it('微信号脱敏', () => {
    expect(maskContact('wx_mingyue123')).toBe('wx_****23')
  })

  it('QQ号脱敏', () => {
    expect(maskContact('12345678')).toBe('123****78')
  })
})
