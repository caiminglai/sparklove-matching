/**
 * API 配置工具函数单元测试
 * 测试：normalizeAvatarUrl 头像路径规范化、API_BASE_URL 不再带子路径前缀
 */

import { describe, it, expect } from 'vitest'
import { normalizeAvatarUrl, API_BASE_URL } from './config'

describe('API_BASE_URL', () => {
  it('以 /api 结尾且不含历史子路径前缀', () => {
    expect(API_BASE_URL.endsWith('/api')).toBe(true)
    expect(API_BASE_URL).not.toContain('/jzxr')
  })
})

describe('normalizeAvatarUrl', () => {
  it('null / undefined / 空串 返回 null', async () => {
    expect(normalizeAvatarUrl(null)).toBeNull()
    expect(normalizeAvatarUrl(undefined)).toBeNull()
    expect(normalizeAvatarUrl('')).toBeNull()
  })

  it('完整 http URL 原样返回', () => {
    expect(normalizeAvatarUrl('https://example.com/avatar.jpg')).toBe(
      'https://example.com/avatar.jpg',
    )
  })

  it('data: URI 原样返回', () => {
    expect(normalizeAvatarUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
  })

  it('已有前导斜杠的路径原样返回，不再叠加子路径前缀', () => {
    expect(normalizeAvatarUrl('/uploads/avatars/test.jpg')).toBe('/uploads/avatars/test.jpg')
    expect(normalizeAvatarUrl('/avatars/test.jpg')).toBe('/avatars/test.jpg')
  })

  it('纯文件名自动补全到上传目录', () => {
    expect(normalizeAvatarUrl('test.jpg')).toBe('/uploads/avatars/test.jpg')
  })
})
