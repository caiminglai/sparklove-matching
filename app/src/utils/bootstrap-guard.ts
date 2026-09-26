/**
 * 首屏请求启动保护器
 * 解决 Vite HMR SSE 长连接重置引发 HTTP/1.1 连接池内请求被连带中断的问题
 * （表现为 Chrome 控制台出现 net::ERR_ABORTED 红字）
 *
 * 原理：
 *   Vite 开发模式下，/@vite/client 会建立 SSE 长连接用于热更新。
 *   该连接在页面加载后 ~50-800ms 期间（含 StrictMode 双 mount）会经历
 *   一次「断开 -> 重连」的重置。由于浏览器 HTTP/1.1 对同一 host 最多 6 个
 *   并发连接，且请求会复用连接，当 SSE 所在连接被 reset 时，该连接上
 *   排队的其他 API 请求会被连带中断，从而在控制台打印红色 net::ERR_ABORTED
 *  （即使请求最终成功也会有红字）。
 *
 * 策略：
 *   1) 统一记录「模块最早加载时间戳」；
 *   2) 所有首屏 API 请求在发起前 await waitForBootstrapSafeWindow()，
 *      保证模块加载后至少 1500ms 才真正发起请求（覆盖 Vite7 + React18
 *      StrictMode 的最大抖动窗口）；
 *   3) 配合 in-flight Promise 去重，避免 StrictMode 双 mount 重复请求。
 */

// window.load 之后额外再等待 1500ms（覆盖 @vite/client SSE 重连 + StrictMode cleanup +
// StrictMode 双 mount 期间的 HTTP/1.1 连接池排空 —— 彻底避免连接 reset 连带中断）
export const BOOTSTRAP_SAFE_DELAY_MS = 1500
const STRICTMODE_DEBOUNCE_MS = 300

// ============================================================
// 【开发模式 HMR 稳定性关键】以下所有共享状态（窗口 Promise / in-flight 缓存
// / 挂起去抖 Map）一律挂在 window 全局单例上，而不是模块级变量。
// 原因：Vite HMR 每次检测到文件变化就会重新执行模块顶层代码，
//       导致模块级 Map/Promise 被重建，StrictMode 去抖 & in-flight dedup
//       跨两次 HMR 实例全部失效 → 再次撞 SSE reset 窗口。
//       只有挂到全局 window 才能在 HMR 重实例化期间保持一份共享状态。
// ============================================================
const GLOBAL_KEY = '__jzxr_bootstrap_guard__'

type GlobalState = {
  safeWindowPromise?: Promise<void>
  inFlightMap: Map<string, Promise<unknown>>
  pendingMap: Map<string, PendingEntry>
}

type PendingEntry = {
  timerId: ReturnType<typeof setTimeout>
  resolveWrapper: (factoryToRun: null | (() => Promise<unknown>)) => void
}

function _getGlobal(): GlobalState {
  const g = globalThis as unknown as { [GLOBAL_KEY]?: GlobalState }
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      inFlightMap: new Map(),
      pendingMap: new Map(),
    }
  }
  return g[GLOBAL_KEY] as GlobalState
}

function _waitForWindowLoad(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve() // SSR 兜底
  if (document.readyState === 'complete') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener('load', done)
      document.removeEventListener('DOMContentLoaded', done)
      resolve()
    }
    window.addEventListener('load', done, { once: true })
    // 兜底：DOMContentLoaded + 800ms 也视为 load 完成（防止 load 因慢资源卡住）
    document.addEventListener('DOMContentLoaded', () => setTimeout(done, 800), { once: true })
  })
}

export function waitForBootstrapSafeWindow(): Promise<void> {
  // 生产环境无需等待 Vite HMR SSE 重置（生产无 HMR），直接 resolve 避免 1.5s 首屏延迟
  if (!import.meta.env.DEV) return Promise.resolve()
  const g = _getGlobal()
  if (g.safeWindowPromise) return g.safeWindowPromise
  g.safeWindowPromise = _waitForWindowLoad().then(
    () => new Promise<void>((r) => setTimeout(r, BOOTSTRAP_SAFE_DELAY_MS)),
  )
  return g.safeWindowPromise
}

function _runFactoryNow<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const g = _getGlobal()
  const existing = g.inFlightMap.get(key)
  if (existing) return existing as Promise<T>
  const p = factory().finally(() => {
    g.inFlightMap.delete(key)
  })
  g.inFlightMap.set(key, p as Promise<unknown>)
  return p
}

export async function withInFlightDedup<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const g = _getGlobal()
  // 如果同 key 的请求已在跑（真的 fetch 已发起），直接复用结果
  if (g.inFlightMap.has(key)) return g.inFlightMap.get(key) as Promise<T>

  const existingPending = g.pendingMap.get(key)
  if (existingPending) {
    // ---------- 第二次同 key 调用在窗口内到达（StrictMode 第二轮 / HMR 重入）----------
    clearTimeout(existingPending.timerId)
    g.pendingMap.delete(key)
    existingPending.resolveWrapper(factory as unknown as () => Promise<unknown>)
    return _runFactoryNow(key, factory)
  }

  // ---------- 第一次到达：挂起 debounce，等待 300ms 看有没有第二轮 ----------
  let wrapperResolve: PendingEntry['resolveWrapper'] | null = null
  const wrapperPromise = new Promise<T>((resolve, reject) => {
    wrapperResolve = (factoryToRun) => {
      if (factoryToRun === null) {
        _runFactoryNow(key, factory).then(resolve, reject)
      } else {
        _runFactoryNow(key, factoryToRun as () => Promise<T>).then(resolve, reject)
      }
    }
  })

  const timerId = setTimeout(() => {
    const gg = _getGlobal()
    gg.pendingMap.delete(key)
    wrapperResolve!(null)
  }, STRICTMODE_DEBOUNCE_MS)

  g.pendingMap.set(key, {
    timerId,
    resolveWrapper: wrapperResolve as NonNullable<typeof wrapperResolve>,
  })

  return wrapperPromise
}
