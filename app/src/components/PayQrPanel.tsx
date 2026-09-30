import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import QRCode from 'qrcode'
import { API_BASE_URL } from '../api/config'
import { getAuthToken } from '../utils/auth'

interface PayQrPanelProps {
  purpose: 'deposit' | 'contact_unlock'
  targetUserId?: string
  amount: number
  label: string
  onPaid: () => void
  onUnauthorized: () => void
}

/**
 * 支付宝扫码面板：下单拿到收银台链接，前端把链接编成二维码，轮询到 paid 就回调。
 * 用来替掉原先贴在页面上的静态个人收款码——个人码没有订单号，付了系统不知道是谁付的。
 */
export default function PayQrPanel({
  purpose,
  targetUserId,
  amount,
  label,
  onPaid,
  onUnauthorized,
}: PayQrPanelProps) {
  const [qr, setQr] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const createOrder = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = getAuthToken()
      const res = await fetch(`${API_BASE_URL}/payment/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ channel: 'alipay', purpose, target_user_id: targetUserId }),
      })
      if (res.status === 401) {
        onUnauthorized()
        return
      }
      const data = await res.json()
      if (res.ok && data.success && data.payUrl) {
        setOrderId(data.orderId)
        setQr(await QRCode.toDataURL(data.payUrl, { margin: 1, width: 240 }))
      } else {
        setQr(null)
        setOrderId(null)
        setError(data.message || '下单失败，请重试')
      }
    } catch {
      setQr(null)
      setOrderId(null)
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }, [purpose, targetUserId, onUnauthorized])

  useEffect(() => {
    createOrder()
  }, [createOrder])

  useEffect(() => {
    if (!orderId) return
    const timer = setInterval(async () => {
      try {
        const token = getAuthToken()
        const res = await fetch(
          `${API_BASE_URL}/payment/status?orderId=${encodeURIComponent(orderId)}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        )
        if (res.status === 401) {
          onUnauthorized()
          return
        }
        const data = await res.json()
        if (data.success && data.status === 'paid') {
          clearInterval(timer)
          onPaid()
        }
      } catch {
        // 轮询失败不打断，下一轮再试
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [orderId, onPaid, onUnauthorized])

  return (
    <div
      className="bg-white rounded-xl p-4 mb-4 border-2 border-dashed"
      style={{ borderColor: 'var(--color-border-light)' }}
    >
      <div className="aspect-square w-full max-w-[280px] mx-auto bg-gray-100 rounded-lg flex items-center justify-center mb-3">
        {qr ? (
          <img src={qr} alt={`${label}支付二维码`} className="w-full h-full object-contain" />
        ) : (
          <div className="text-center text-gray-400 px-4">
            <p className="text-sm">
              {loading ? '正在生成支付二维码...' : error || '二维码获取失败'}
            </p>
            {!loading && (
              <button
                onClick={createOrder}
                className="mt-2 text-xs px-3 py-1.5 rounded-lg text-white"
                style={{ background: 'var(--color-alipay)' }}
              >
                重新获取
              </button>
            )}
          </div>
        )}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
          扫码支付 ¥{amount}
        </p>
        <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
          使用支付宝扫一扫，支付后本页自动生效
        </p>
        <button
          onClick={createOrder}
          className="mt-2 text-xs flex items-center gap-1 mx-auto"
          style={{ color: 'var(--color-text-light)' }}
        >
          <RefreshCw size={12} /> 换一张码
        </button>
      </div>
    </div>
  )
}
