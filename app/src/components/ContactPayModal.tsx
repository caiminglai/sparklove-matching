import { useState } from 'react'
import { ArrowLeft, Zap, Upload, CheckCircle } from 'lucide-react'
import { API_BASE_URL } from '../api/config'
import { getAuthToken } from '../utils/auth'
import { usePricing } from '../utils/pricing'

interface ContactPayModalProps {
  targetUserId: string
  onClose: () => void
}

export default function ContactPayModal({ targetUserId, onClose }: ContactPayModalProps) {
  const amount = usePricing().contact_unlock_amount
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [method, setMethod] = useState<'alipay' | 'wechat'>('alipay')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [qrError, setQrError] = useState(false)

  const handleAutoPay = async () => {
    setStatus('正在创建支付订单...')
    try {
      const token = getAuthToken()
      const res = await fetch(`${API_BASE_URL}/payments/view-contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          target_user_id: targetUserId,
          method,
        }),
      })
      const data = await res.json()
      if (data.success && data.payment_url) {
        window.open(data.payment_url, '_blank')
        setStatus('支付完成后将自动解锁，如未解锁请刷新页面')
      } else {
        setStatus(data.message || '支付功能暂未开通，请使用手动上传凭证')
        setTimeout(() => setStatus(''), 3000)
      }
    } catch {
      setStatus('网络错误，请使用手动上传凭证')
      setTimeout(() => setStatus(''), 3000)
    }
  }

  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setProofFile(file)
  }

  const handleSubmitProof = async () => {
    if (!proofFile) return
    setUploading(true)
    setStatus('提交中...')
    try {
      const formData = new FormData()
      formData.append('proof', proofFile)
      formData.append('target_user_id', targetUserId)
      formData.append('method', method)

      const token = getAuthToken()
      const res = await fetch(`${API_BASE_URL}/unlock-contact/submit`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        setStatus('凭证提交成功，管理员将在24小时内审核')
        setProofFile(null)
        setTimeout(() => {
          setStatus('')
          onClose()
        }, 2500)
      } else {
        setStatus(data.message || '提交失败')
      }
    } catch {
      setStatus('提交失败，请重试')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 mx-4"
        style={{ background: 'var(--color-bg-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            查看联系方式
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg"
            style={{ color: 'var(--color-text-light)' }}
          >
            <ArrowLeft size={20} />
          </button>
        </div>

        {/* 支付模式选择 */}
        <div
          className="flex gap-2 mb-4 p-1 rounded-xl"
          style={{ background: 'rgba(var(--color-primary-rgb), 0.05)' }}
        >
          <button
            onClick={() => setMode('auto')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
              mode === 'auto' ? 'text-white shadow' : 'text-gray-600 hover:bg-white/50'
            }`}
            style={
              mode === 'auto'
                ? {
                    background:
                      'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                  }
                : {}
            }
          >
            <Zap size={14} /> 自动支付
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
              mode === 'manual' ? 'text-white shadow' : 'text-gray-600 hover:bg-white/50'
            }`}
            style={
              mode === 'manual'
                ? {
                    background:
                      'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                  }
                : {}
            }
          >
            <Upload size={14} /> 手动上传
          </button>
        </div>

        {/* 支付方式选择 */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => {
              setMethod('alipay')
              setQrError(false)
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              method === 'alipay'
                ? 'text-white shadow-lg'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={
              method === 'alipay'
                ? {
                    background:
                      'linear-gradient(135deg, var(--color-alipay), var(--color-alipay-dark))',
                  }
                : {}
            }
          >
            支付宝
          </button>
          <button
            onClick={() => {
              setMethod('wechat')
              setQrError(false)
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              method === 'wechat'
                ? 'text-white shadow-lg'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={
              method === 'wechat'
                ? {
                    background:
                      'linear-gradient(135deg, var(--color-wechat), var(--color-wechat-dark))',
                  }
                : {}
            }
          >
            微信
          </button>
        </div>

        {/* 自动支付模式 */}
        {mode === 'auto' && (
          <>
            <div
              className="bg-white rounded-xl p-4 mb-4 text-center"
              style={{ border: '1px solid var(--color-border-light)' }}
            >
              <p className="text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>
                点击下方按钮，跳转到{method === 'alipay' ? '支付宝' : '微信'}完成支付
              </p>
              <p className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
                ¥{amount}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>
                支付成功后自动解锁，无需等待审核
              </p>
            </div>
            <button
              onClick={handleAutoPay}
              className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all flex items-center justify-center gap-2"
              style={{
                background:
                  method === 'alipay'
                    ? 'linear-gradient(135deg, var(--color-alipay), var(--color-alipay-dark))'
                    : 'linear-gradient(135deg, var(--color-wechat), var(--color-wechat-dark))',
              }}
            >
              <Zap size={16} /> 立即支付 ¥{amount}
            </button>
            {status && (
              <p className="text-xs text-center mt-3" style={{ color: 'var(--color-primary)' }}>
                {status}
              </p>
            )}
          </>
        )}

        {/* 手动上传模式 */}
        {mode === 'manual' && (
          <>
            {/* 收款码 */}
            <div
              className="bg-white rounded-xl p-4 mb-4 border-2 border-dashed"
              style={{ borderColor: 'var(--color-border-light)' }}
            >
              <div className="aspect-square w-full max-w-[280px] mx-auto bg-gray-100 rounded-lg flex items-center justify-center mb-3">
                {qrError ? (
                  <div className="text-center text-gray-400">
                    <p className="text-sm mb-2">
                      {method === 'alipay' ? '支付宝' : '微信'}收款码加载失败
                    </p>
                    <p className="text-xs">请联系管理员获取</p>
                  </div>
                ) : (
                  <img
                    src={`/${method}-qr.png`}
                    alt={`${method === 'alipay' ? '支付宝' : '微信'}收款码`}
                    className="w-full h-full object-contain rounded-lg"
                    onError={() => {
                      setQrError(true)
                    }}
                  />
                )}
              </div>
              <div className="text-center">
                <p
                  className="text-sm font-medium mb-1"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  扫码支付 ¥{amount}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                  使用{method === 'alipay' ? '支付宝' : '微信'}扫一扫
                </p>
              </div>
            </div>

            {/* 上传凭证 */}
            <div className="mb-4">
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--color-text-primary)' }}
              >
                上传支付凭证 <span style={{ color: 'var(--color-primary)' }}>*</span>
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleProofUpload}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--color-border)' }}
              />
              {proofFile && (
                <div
                  className="mt-2 text-xs flex items-center gap-2"
                  style={{ color: 'var(--color-success)' }}
                >
                  <CheckCircle size={14} />
                  <span>已选择: {proofFile.name}</span>
                </div>
              )}
            </div>

            {/* 提交按钮 */}
            <button
              onClick={handleSubmitProof}
              disabled={!proofFile || uploading}
              className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
              }}
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  提交中...
                </>
              ) : (
                <>
                  <Upload size={16} /> 提交凭证
                </>
              )}
            </button>

            {status && (
              <p
                className="text-xs mt-3 text-center"
                style={{
                  color: status.includes('成功') ? 'var(--color-success)' : 'var(--color-primary)',
                }}
              >
                {status}
              </p>
            )}
            <p className="text-xs mt-2 text-center" style={{ color: 'var(--color-text-light)' }}>
              管理员将在24小时内审核，审核结果将通知您
            </p>
          </>
        )}
      </div>
    </div>
  )
}
