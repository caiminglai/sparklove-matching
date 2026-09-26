/**
 * 轻量级 Toast 提示组件
 * 替代 alert()，支持成功/错误/信息三种类型，3秒自动消失
 */
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
  type ReactNode,
} from 'react'
import { setToastFn } from '../utils/errorHandler'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

/** 在根组件包裹 <ToastProvider>，子组件可通过 useToast() 调用 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextIdRef = useRef(0)

  const add = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextIdRef.current++
    setItems((prev) => [...prev, { id, message, type }])
  }, [])

  // 注入到 errorHandler，使 showError 使用 toast 而非 alert
  useEffect(() => {
    setToastFn(add)
    return () => setToastFn(null)
  }, [add])

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: add }}>
      {children}
      {/* Toast 容器 - 固定在页面顶部居中 */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** 子组件中调用：const { toast } = useToast(); toast('操作成功', 'success'); */
export function useToast(): ToastContextValue {
  return useContext(ToastContext)
}

/** Toast 卡片 */
function ToastCard({ item, onRemove }: { item: ToastItem; onRemove: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(item.id), 3000)
    return () => clearTimeout(timer)
  }, [item.id, onRemove])

  const bgColor =
    item.type === 'success' ? 'bg-green-500' : item.type === 'error' ? 'bg-red-500' : 'bg-gray-700'

  return (
    <div
      className={`${bgColor} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium
        animate-[fadeIn_0.2s_ease-out] pointer-events-auto max-w-[80vw] text-center`}
      role="alert"
    >
      {item.message}
    </div>
  )
}
