/**
 * draft.service 单元测试
 * 覆盖：白名单裁剪（红线字段必须被剔除）、命名空间键名、节流判断、TTL 过期清理、
 *       提交后清除、脏值/空值不落盘。每组都打印真实返回值。
 * 注意：涉及 localStorage 的操作需要 mock（与 user.service.test.ts 同一套路）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  DRAFT_NAMESPACE,
  DRAFT_TTL_MS,
  DRAFT_WHITELIST,
  DRAFT_WRITE_INTERVAL_MS,
  FORBIDDEN_KEY_PATTERN,
  clearDraft,
  draftKey,
  loadDraft,
  pickDraftValues,
  saveDraft,
  shouldWriteDraft,
} from './draft.service'

const store: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key]
  }),
  clear: vi.fn(() => {
    Object.keys(store).forEach((k) => delete store[k])
  }),
}

beforeEach(() => {
  localStorageMock.clear()
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true })
})

function show(title: string, input: unknown, result: unknown) {
  console.log(
    `[草稿] ${title}\n  输入: ${JSON.stringify(input)}\n  返回: ${JSON.stringify(result)}`,
  )
}

const RAW = {
  name: '小美',
  city: '杭州',
  job: '设计师',
  hobbies: '旅行,摄影',
  contact: '13800001111',
  phone: '13800001111',
  realName: '王大锤',
  email: 'a@b.com',
  password: 'hunter2',
  auth_token: 'Bearer abc.def',
  idCard: '110101199001011234',
  birthday: '1990-01-01',
  avatar: 'data:image/png;base64,AAAA',
  gender: '   ',
  income: '',
  expectation: 'null',
}

describe('pickDraftValues（白名单裁剪，纯函数）', () => {
  it('全敏感输入 -> 只留白名单字段，红线字段一个都不进', () => {
    const out = pickDraftValues('profile', RAW)
    show('含手机号/身份证/邮箱/密码/token 的混合表单', RAW, out)
    expect(out).toEqual({ name: '小美', city: '杭州', job: '设计师', hobbies: '旅行,摄影' })
    for (const forbidden of [
      'contact',
      'phone',
      'realName',
      'email',
      'password',
      'auth_token',
      'idCard',
      'birthday',
      'avatar',
      'gender',
      'income',
      'expectation',
    ]) {
      expect(out).not.toHaveProperty(forbidden)
    }
  })

  it('全空 -> {}', () => {
    const out = pickDraftValues('profile', { name: '', city: '   ', job: null, expectation: '[]' })
    show('全空/纯空格/null/脏值', { name: '', city: '   ', job: null, expectation: '[]' }, out)
    expect(out).toEqual({})
  })

  it('超长值截断到 500 字符', () => {
    const out = pickDraftValues('post', { expectation: '啊'.repeat(600) })
    console.log('[草稿] 超长截断 -> length =', out.expectation?.length)
    expect(out.expectation).toHaveLength(500)
  })

  it('白名单自身不含任何命中敏感命名模式的 key', () => {
    for (const formId of Object.keys(DRAFT_WHITELIST) as (keyof typeof DRAFT_WHITELIST)[]) {
      const hit = DRAFT_WHITELIST[formId].filter((k) => FORBIDDEN_KEY_PATTERN.test(k))
      console.log(
        `[草稿] ${formId} 白名单大小 = ${DRAFT_WHITELIST[formId].length}，命中敏感模式 =`,
        JSON.stringify(hit),
      )
      expect(hit).toEqual([])
    }
    expect(DRAFT_WHITELIST.profile).not.toContain('contact')
    expect(DRAFT_WHITELIST.profile).not.toContain('avatar')
  })
})

describe('saveDraft / loadDraft / clearDraft', () => {
  it('键名带站点命名空间，写入带时间戳', () => {
    const now = 1700000000000
    const wrote = saveDraft('profile', RAW, now)
    const key = Object.keys(store)[0]
    console.log('[草稿] 实际 localStorage 键名 =', key)
    console.log('[草稿] 实际存储值 =', store[key])
    expect(wrote).toBe(true)
    expect(draftKey('profile')).toBe('jzxr:draft:profile')
    expect(draftKey('post')).toBe('jzxr:draft:post')
    expect(key).toBe(`${DRAFT_NAMESPACE}:profile`)
    expect(key).toBe('jzxr:draft:profile')
    expect(JSON.parse(store[key])).toEqual({
      savedAt: now,
      values: { name: '小美', city: '杭州', job: '设计师', hobbies: '旅行,摄影' },
    })
  })

  it('没有任何可存字段时不落盘', () => {
    expect(saveDraft('profile', { contact: '13800001111' }, Date.now())).toBe(false)
    expect(Object.keys(store)).toHaveLength(0)
  })

  it('正常读写往返 + 提交后清除', () => {
    const now = 1700000000000
    saveDraft('post', RAW, now)
    const loaded = loadDraft('post', now + 60_000)
    show('写入后 1 分钟读取', 'jzxr:draft:post', loaded)
    expect(loaded).toEqual({
      savedAt: now,
      values: { name: '小美', city: '杭州', job: '设计师', hobbies: '旅行,摄影' },
    })
    clearDraft('post')
    expect(loadDraft('post')).toBeNull()
    expect(store['jzxr:draft:post']).toBeUndefined()
  })

  it('超过 7 天：loadDraft 返回 null 并把键删掉', () => {
    const savedAt = 1700000000000
    saveDraft('profile', RAW, savedAt)
    expect(store['jzxr:draft:profile']).toBeDefined()
    const expired = loadDraft('profile', savedAt + DRAFT_TTL_MS + 1000)
    console.log(
      '[草稿] 7天+1秒后读取 ->',
      JSON.stringify(expired),
      '，键还在吗 ->',
      store['jzxr:draft:profile'] !== undefined,
    )
    expect(expired).toBeNull()
    expect(store['jzxr:draft:profile']).toBeUndefined()
  })

  it('未过期边界：第 6 天仍可恢复', () => {
    const savedAt = 1700000000000
    saveDraft('profile', RAW, savedAt)
    expect(loadDraft('profile', savedAt + DRAFT_TTL_MS - 1000)).not.toBeNull()
  })

  it('JSON 被手工改坏 / 塞进敏感 key 时：丢弃且不还原', () => {
    store['jzxr:draft:profile'] = '{坏掉的 JSON'
    expect(loadDraft('profile')).toBeNull()
    expect(store['jzxr:draft:profile']).toBeUndefined()

    store['jzxr:draft:profile'] = JSON.stringify({
      savedAt: Date.now(),
      values: { phone: '13800001111', name: '小美' },
    })
    const loaded = loadDraft('profile')
    show('手工塞入 phone 键的草稿', 'values:{phone,name}', loaded)
    expect(loaded!.values).toEqual({ name: '小美' })
  })

  it('节流：2 秒内不重复写盘', () => {
    const t0 = 1700000000000
    console.log(
      '[草稿] shouldWriteDraft(t0, 0) =',
      shouldWriteDraft(t0, 0),
      '| shouldWriteDraft(t0+1999, t0) =',
      shouldWriteDraft(t0 + 1999, t0),
      '| shouldWriteDraft(t0+2000, t0) =',
      shouldWriteDraft(t0 + 2000, t0),
    )
    expect(shouldWriteDraft(t0, 0)).toBe(true)
    expect(shouldWriteDraft(t0 + 1999, t0)).toBe(false)
    expect(shouldWriteDraft(t0 + DRAFT_WRITE_INTERVAL_MS, t0)).toBe(true)
  })
})
