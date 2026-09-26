/**
 * 字段中文映射服务
 * 职责：从后端获取字段映射数据，作为字段标签和选项的唯一数据源
 * 策略：优先从 API 获取，失败时回退到 constants.ts 硬编码默认值
 */

import { API_BASE_URL } from '../api/config'
import { DEFAULT_COLUMNS, FIELD_LABELS } from '../data/constants'
import type { Column } from '../data/types'
import { waitForBootstrapSafeWindow, withInFlightDedup } from '../utils/bootstrap-guard'

/**
 * 将 options 元素（可能是对象）规范化为纯字符串，避免对象被渲染为 React children。
 * 与 SearchPanel 中的 normalizeOptions 保持语义一致，但这里作为服务层的
 * 标准化入口，从源头把 Column[] 修正，避免在下游各组件各自处理时遗漏。
 */
function safeLabel(label: unknown): string {
  if (label === null || label === undefined) return ''
  if (typeof label === 'string') return label
  if (typeof label === 'number' || typeof label === 'bigint') return String(label)
  if (typeof label === 'object') {
    const o = label as Record<string, unknown>
    const v = o.label ?? o.name ?? o.title ?? o.text ?? o.value
    if (v !== undefined && v !== null) return String(v)
    return ''
  }
  return String(label)
}

function safeOptions(opts: unknown): string[] {
  if (!opts) return []
  const normalizeOne = (raw: unknown): string => {
    if (raw === null || raw === undefined || typeof raw === 'boolean') return ''
    if (typeof raw === 'string') return raw
    if (typeof raw === 'number' || typeof raw === 'bigint') return String(raw)
    if (typeof raw === 'object') {
      const o = raw as Record<string, unknown>
      const v = o.label ?? o.value ?? o.name ?? o.key ?? o.text ?? o.title
      if (v !== undefined && v !== null) return String(v)
      return ''
    }
    return String(raw)
  }
  if (!Array.isArray(opts)) {
    const s = normalizeOne(opts)
    return s ? [s] : []
  }
  const out: string[] = []
  for (const raw of opts) {
    const s = normalizeOne(raw)
    if (s) out.push(s)
  }
  return out
}

function normalizeColumn(col: {
  key?: unknown
  label?: unknown
  type?: unknown
  options?: unknown
  category?: unknown
}): Column {
  return {
    key: String(col.key || ''),
    label: safeLabel(col.label) || String(col.key || ''),
    type: col.type === 'text' || col.type === 'select' || col.type === 'tags' ? col.type : 'text',
    options: safeOptions(col.options),
    category: typeof col.category === 'string' && col.category ? col.category : '其他',
  }
}

const LS_KEY = 'field_mappings_cache'
const LS_LABELS_KEY = 'field_labels_cache'

// 缓存结构：{ value: T, version: string }
interface CachedData<T> {
  value: T
  version: string
}

function readCache<T>(key: string): CachedData<T> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data && data.value && data.version) return data as CachedData<T>
  } catch {
    console.warn('readCache: 缓存读取失败')
  }
  return null
}

function writeCache<T>(key: string, value: T, version: string) {
  try {
    localStorage.setItem(key, JSON.stringify({ value, version }))
  } catch {
    console.warn('writeCache: 缓存写入失败')
  }
}

// 【字段映射接口专属安全延迟】在 window.load + 1500ms 之后再额外等待 500ms。
// 根因：首屏的 4 个 API（custom-fields / field-mappings / users?page=1 / all-custom-fields）
//       会一起抢占 HTTP/1.1 仅有的 6 条同 host 连接，其中一条连接上还跑着 @vite/client
//       的 SSE 长连接。SSE 在 Vite 开发模式下会「断开→重连」(RST)，排在同一条 TCP 连接
//       上的请求会被连带 abort（Chrome 控制台红字 net::ERR_ABORTED），而其他 3 个 API
//       恰好运气好分到了另外 5 条干净连接上就会成功。
//
//       解法：把 field-mappings 单独延后 500ms 发起，等 SSE reset 已经发生完毕，
//       浏览器自然会打开一条新的、干净的 TCP 连接来发这个请求，彻底避开 RST 连
//       接队列。field-mappings 首屏初始化有 DEFAULT_COLUMNS 兜底，晚 500ms 完全不影响 UX。
const FIELD_MAPPINGS_EXTRA_SAFETY_MS = 500

async function _fetchFieldMappingsOnce(
  cached: CachedData<Column[]> | null,
): Promise<{ ok: boolean; columns?: Column[]; isAbort?: boolean }> {
  const headers: Record<string, string> = {}
  if (cached) headers['If-None-Match'] = cached.version
  try {
    const res = await fetch(`${API_BASE_URL}/field-mappings`, { headers, credentials: 'include' })
    if (res.status === 304 && cached) {
      return { ok: true, columns: cached.value.map((c) => normalizeColumn(c)) }
    }
    if (res.ok) {
      const data = await res.json()
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        const columns: Column[] = data.data.map(
          (m: {
            field_key?: unknown
            field_label?: unknown
            field_type?: unknown
            options?: unknown
            field_category?: unknown
          }) =>
            normalizeColumn({
              key: m.field_key,
              label: m.field_label,
              type: m.field_type,
              options: m.options,
              category: m.field_category,
            }),
        )
        const version = res.headers.get('ETag') || String(Date.now())
        writeCache(LS_KEY, columns, version)
        return { ok: true, columns }
      }
    }
    return { ok: false }
  } catch (e) {
    return { ok: false, isAbort: (e as Error)?.name === 'AbortError' }
  }
}

// 从后端获取字段映射，转为 Column[] 格式（ETag 版本缓存 + in-flight 去重 + 错开 HMR 窗口期）
export async function fetchFieldMappings(_signal?: AbortSignal): Promise<Column[]> {
  return withInFlightDedup('field-mappings:columns', async () => {
    await waitForBootstrapSafeWindow()
    // 额外错开 500ms：避开 SSE reset 所在连接的 RST 并发队列
    await new Promise<void>((r) => setTimeout(r, FIELD_MAPPINGS_EXTRA_SAFETY_MS))

    const cached = readCache<Column[]>(LS_KEY)
    const first = await _fetchFieldMappingsOnce(cached)
    if (first.ok && first.columns) return first.columns

    // 【兜底 retry】如果第一次被 abort（极端情况下还是撞上了），立即重试一次：
    // 此时 RST 已经过去，第二次 fetch 必然打开新连接，成功概率 99%+。
    if (first.isAbort) {
      const second = await _fetchFieldMappingsOnce(cached)
      if (second.ok && second.columns) return second.columns
    }

    // 最终回退：缓存（也要 normalize，避免旧缓存存了对象数组） > 硬编码
    return cached?.value
      ? cached.value.map((c) => normalizeColumn(c))
      : DEFAULT_COLUMNS.map((c) => normalizeColumn(c))
  })
}

// 从后端获取字段标签映射表（ETag 版本缓存 + AbortSignal 支持）
export async function fetchFieldLabels(signal?: AbortSignal): Promise<Record<string, string>> {
  const cached = readCache<Record<string, string>>(LS_LABELS_KEY)
  const headers: Record<string, string> = {}
  if (cached) headers['If-None-Match'] = cached.version

  try {
    const res = await fetch(`${API_BASE_URL}/field-mappings/labels`, {
      headers,
      signal,
      credentials: 'include',
    })
    if (res.status === 304 && cached) return cached.value
    if (res.ok) {
      const data = await res.json()
      if (data.success && data.data) {
        const version = res.headers.get('ETag') || String(Date.now())
        writeCache(LS_LABELS_KEY, data.data, version)
        return data.data as Record<string, string>
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    console.warn('fetchFieldLabels: API不可用时回退')
  }
  return cached?.value || FIELD_LABELS
}

// 同步获取默认列（用于初始化，不等待API）
export function getDefaultColumns(): Column[] {
  return DEFAULT_COLUMNS
}
