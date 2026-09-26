/**
 * 表单草稿自动保存（白名单机制，纯函数 + 显式 localStorage 读写，无第三方依赖）
 *
 * 键名规范：jzxr:draft:<表单标识>，值形如 { values: {字段名:字符串}, savedAt: 毫秒时间戳 }
 * 读取时超过 DRAFT_TTL_MS 直接丢弃并清理；提交成功后必须调用 clearDraft()。
 */

import { isFieldFilled } from '../utils/profile-completeness'

export type DraftFormId = 'profile' | 'post'

/** 站点命名空间前缀（本站站名 jzxr，避免与同域下其他应用的 key 冲突） */
export const DRAFT_NAMESPACE = 'jzxr:draft'

/** 草稿有效期：7 天，过期即丢弃并清理 */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 两次落盘的最小间隔（毫秒），避免每次 keystroke 都写 localStorage */
export const DRAFT_WRITE_INTERVAL_MS = 2000

/** 单个字段值长度上限，超长直接截断（防止有人把整段 base64 塞进文本框撑爆 5MB 配额） */
export const DRAFT_MAX_VALUE_LEN = 500

/**
 * 【红线】白名单：只有这里显式列出的字段才允许写进 localStorage。
 * 手机号 / 身份证号 / 真实姓名 / 邮箱 / 密码 / token / 任何鉴权信息一律不得写入本地存储；
 * 以后往表单里加字段时，必须先过这条审查，通过了才准往下面的数组里加一行——不在名单里就一律不存。
 *
 * 显式排除（有意为之，不是漏写）：
 *   - contact       联系方式，实际存的就是手机号 / 微信号，属于红线字段（本站是付费解锁字段）
 *   - avatar        头像在本页是 dataURL，单张可达数 MB，会把 localStorage 配额打爆；头像走
 *                   POST /api/upload/avatar 独立落库，本来就不需要草稿
 *   - birthday      生日 + 昵称即可定位真实身份，属于可识别个人信息，保守不存
 *   - 自定义标签     field_key 由用户自由输入，可能被人写成「手机号」，且失焦即已实时保存，无需草稿
 */
const SAFE_DRAFT_FIELDS: readonly string[] = Object.freeze([
  // 基本
  'purpose',
  'name',
  'gender',
  'age',
  'height',
  'weight',
  'city',
  'relationship_status',
  // 外貌
  'skinTone',
  'faceType',
  'eyeType',
  'mouthType',
  'bodyType',
  'hairstyle',
  'glasses',
  // 属性
  'zodiac',
  'bloodType',
  'marriage',
  'children',
  'education',
  'job',
  'income',
  'house',
  'car',
  // 个性
  'personality',
  'smoke',
  'drink',
  'religion',
  'pet',
  'attachment_style',
  'love_language',
  'want_children',
  'sleep_schedule',
  'social_frequency',
  'most_values',
  // 兴趣（tags 字段存的是逗号拼接字符串）
  'hobbies',
  'food',
  'sport',
  'music',
  'interestTags',
  'genshin',
  'anime_char',
  'cosplay',
  'photography',
  'game_preference',
  'social_apps',
  'spending_habits',
  'travel_frequency',
  'music_platform',
  'show_preference',
  'reading_preference',
  // 其他
  'expectation',
])

/** 表单标识 -> 允许草稿化的字段名列表（资料编辑与发布投稿的字段集同源：/api/field-mappings） */
export const DRAFT_WHITELIST: Readonly<Record<DraftFormId, readonly string[]>> = Object.freeze({
  profile: SAFE_DRAFT_FIELDS,
  post: SAFE_DRAFT_FIELDS,
})

/**
 * 兜底防线：即使有人误把敏感字段加进白名单，这个名字层面的拦截也会把它丢掉。
 * 覆盖 手机/电话/身份证/真实姓名/邮箱/密码/token/鉴权/验证码/会话/密钥。
 */
export const FORBIDDEN_KEY_PATTERN =
  /(phone|mobile|tel|id_?card|idno|identity|real_?name|user_?name|email|mail|password|passwd|pwd|token|secret|auth|cookie|session|captcha|verify|verification|sms)/i

export interface Draft {
  values: Record<string, string>
  savedAt: number
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function draftKey(formId: DraftFormId): string {
  return `${DRAFT_NAMESPACE}:${formId}`
}

/**
 * 按白名单裁剪表单对象：不在名单里的键、命中敏感命名模式的键、空值 / 脏占位值、非字符串化的值都会被剔除。
 * 纯函数，不落盘，方便单测。
 */
export function pickDraftValues(
  formId: DraftFormId,
  data: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!data || typeof data !== 'object') return out
  const allowed = DRAFT_WHITELIST[formId] || []

  for (const key of allowed) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) continue
    const raw = (data as Record<string, unknown>)[key]
    if (raw === null || raw === undefined) continue
    if (typeof raw === 'object') continue // 对象 / 数组不属于文本表单值，不存
    // 「算不算已填」只有一处定义：复用完整度判据，空串 / 纯空格 / "null" / "[]" / "{}" 这类脏值都不落盘
    if (!isFieldFilled(raw)) continue
    const value = String(raw).trim()
    out[key] = value.length > DRAFT_MAX_VALUE_LEN ? value.slice(0, DRAFT_MAX_VALUE_LEN) : value
  }
  return out
}

/** 节流判断：距上次落盘是否已超过最小间隔 */
export function shouldWriteDraft(now: number, lastWriteAt: number): boolean {
  return now - lastWriteAt >= DRAFT_WRITE_INTERVAL_MS
}

/** 写入草稿；裁剪后没有任何有效字段时不写。返回是否真的写了盘。 */
export function saveDraft(
  formId: DraftFormId,
  data: Record<string, unknown>,
  now = Date.now(),
): boolean {
  const values = pickDraftValues(formId, data)
  if (Object.keys(values).length === 0) return false
  const ls = storage()
  if (!ls) return false
  try {
    ls.setItem(draftKey(formId), JSON.stringify({ values, savedAt: now }))
    return true
  } catch {
    // 配额满 / 隐私模式：静默放弃草稿，绝不能影响正常填写
    return false
  }
}

/**
 * 读取草稿。以下情况一律视为「无草稿」并顺手清理：解析失败、结构不合法、超过 7 天、裁剪后为空。
 * 读取时会再过一遍白名单 + 敏感命名拦截，防止有人手工往 localStorage 里塞脏 key。
 */
export function loadDraft(formId: DraftFormId, now = Date.now()): Draft | null {
  const ls = storage()
  if (!ls) return null
  const key = draftKey(formId)
  const raw = ls.getItem(key)
  if (!raw) return null

  const drop = () => {
    try {
      ls.removeItem(key)
    } catch {
      /* 忽略 */
    }
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return drop()
  }
  if (!parsed || typeof parsed !== 'object') return drop()

  const savedAt = (parsed as { savedAt?: unknown }).savedAt
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return drop()
  if (now - savedAt > DRAFT_TTL_MS) return drop()

  const values = pickDraftValues(
    formId,
    (parsed as { values?: unknown }).values as Record<string, unknown>,
  )
  if (Object.keys(values).length === 0) return drop()
  return { values, savedAt }
}

/** 清除草稿（提交成功后必须调用） */
export function clearDraft(formId: DraftFormId): void {
  const ls = storage()
  if (!ls) return
  try {
    ls.removeItem(draftKey(formId))
  } catch {
    /* 忽略 */
  }
}

/** 草稿保存时间的简短展示文案，例如「今天 15:04」/「3 天前」 */
export function formatDraftAge(savedAt: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - savedAt) / 60000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}
