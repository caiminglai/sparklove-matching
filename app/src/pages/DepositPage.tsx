import { Link } from 'react-router'
import {
  ArrowLeft,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Ban,
  Wallet,
  FileCheck,
  RefreshCw,
  HelpCircle,
  Users,
  AlertOctagon,
  Upload,
  Zap,
} from 'lucide-react'
import { API_BASE_URL } from '../api/config'
import { useState, useEffect } from 'react'
import { useToast } from '../components/Toast'
import { getAuthToken } from '../utils/auth'
import { usePricing } from '../utils/pricing'
import QRCode from 'qrcode'

export default function DepositPage() {
  const { toast } = useToast()
  const pricing = usePricing()
  const depositPrice = pricing.deposit_amount
  const platformFee = pricing.platform_fee
  const emotionalDamage = pricing.emotional_damage
  const deleteRefund = pricing.delete_refund
  const refundAfterNoFault = depositPrice - platformFee
  const [showPayment, setShowPayment] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<'alipay' | 'wechat'>('alipay')
  const [qrError, setQrError] = useState(false)
  const [paymentMode, setPaymentMode] = useState<'auto' | 'manual'>('auto') // 新增：支付模式
  const [uploadedProof, setUploadedProof] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [depositStatus, setDepositStatus] = useState<{
    status: string
    admin_note?: string
  } | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [creatingOrder, setCreatingOrder] = useState(false) // 新增：创建订单中
  const [nativeQr, setNativeQr] = useState<string | null>(null) // 微信 Native 下单返回的支付二维码

  const loadDepositStatus = async () => {
    try {
      const token = getAuthToken()
      if (!token) {
        setLoadingStatus(false)
        return
      }

      const res = await fetch(`${API_BASE_URL}/users/my-deposit`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (res.ok) {
        const result = await res.json()
        if (result.success && result.data) {
          setDepositStatus({
            status: result.data.status,
            admin_note: result.data.admin_note,
          })
        }
      }
    } catch (err) {
      console.warn('查询保证金状态失败', err)
    } finally {
      setLoadingStatus(false)
    }
  }

  // 检查支付订单状态
  const checkPaymentStatus = async (orderId: string) => {
    try {
      const token = getAuthToken()
      if (!token) return

      const res = await fetch(`${API_BASE_URL}/payment/status?orderId=${orderId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (res.ok) {
        const result = await res.json()
        if (result.success && result.status === 'paid') {
          // 支付成功，清除待确认订单
          localStorage.removeItem('pending_order_id')
          setNativeQr(null)
          // 重新加载保证金状态
          await loadDepositStatus()
          return true
        }
      }
    } catch (err) {
      console.warn('查询订单状态失败', err)
    }
    return false
  }

  // 加载用户的保证金状态
  useEffect(() => {
    loadDepositStatus()

    // 检查是否有待确认的订单（从支付页面返回）
    const pendingOrderId = localStorage.getItem('pending_order_id')
    if (pendingOrderId) {
      checkPaymentStatus(pendingOrderId)
    }

    // 每30秒自动检查一次审核状态
    const interval = setInterval(loadDepositStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  // 二维码展示期间轮询订单状态，回调落库后自动收起
  useEffect(() => {
    if (!nativeQr) return
    const timer = setInterval(() => {
      const id = localStorage.getItem('pending_order_id')
      if (!id) {
        setNativeQr(null)
        return
      }
      checkPaymentStatus(id)
    }, 3000)
    return () => clearInterval(timer)
  }, [nativeQr])

  const handleUploadProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast('请上传图片文件', 'error')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast('图片大小不能超过5MB', 'error')
      return
    }

    setUploadedProof(file)
  }

  const handleSubmitPayment = async () => {
    if (!uploadedProof) {
      toast('请先上传支付凭证', 'error')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('proof', uploadedProof)

      const token = getAuthToken()
      const res = await fetch(`${API_BASE_URL}/deposit/upload-proof`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (res.ok) {
        const result = await res.json()
        if (result.success) {
          toast('支付凭证已提交，管理员将在24小时内审核', 'success')
          // 重新加载状态
          await loadDepositStatus()
          setShowPayment(false)
          setUploadedProof(null)
        } else {
          toast(result.message || '提交失败', 'error')
        }
      } else {
        toast('提交失败，请重试', 'error')
      }
    } catch (err) {
      toast('网络错误，请检查网络连接', 'error')
    } finally {
      setUploading(false)
    }
  }

  // 新增：自动支付
  const handleAutoPayment = async () => {
    setCreatingOrder(true)
    try {
      const token = getAuthToken()
      const res = await fetch(`${API_BASE_URL}/payment/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel: selectedMethod,
        }),
      })

      if (res.ok) {
        const result = await res.json()
        if (result.success && result.codeUrl) {
          // 微信扫码支付：不跳转，本页出码等扫码
          localStorage.setItem('pending_order_id', result.orderId)
          setNativeQr(await QRCode.toDataURL(result.codeUrl, { margin: 1, width: 240 }))
        } else if (result.success && result.payUrl) {
          // 保存订单号，用于支付成功后查询
          localStorage.setItem('pending_order_id', result.orderId)
          // 跳转到支付页面
          window.location.href = result.payUrl
        } else {
          toast(result.message || '创建订单失败', 'error')
        }
      } else {
        const error = await res.json()
        toast(error.message || '创建订单失败', 'error')
      }
    } catch (err) {
      toast('网络错误，请检查网络连接', 'error')
    } finally {
      setCreatingOrder(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-main)' }}>
      <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/"
            className="p-2 rounded-lg hover-warm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <ArrowLeft size={18} />
          </Link>
          <Shield size={16} style={{ color: 'var(--color-success)' }} />
          <h1 className="text-lg font-medium" style={{ color: 'var(--color-text-primary)' }}>
            保证金制度
          </h1>
        </div>

        {/* Why */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background:
              'linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.04), var(--color-bg-card))',
            border: '1px solid var(--color-bg-warm)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} style={{ color: 'var(--color-primary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
              为什么需要保证金？
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            防止数据造假。比如有人身高150cm，却填写180cm。没有约束，线上信息就不可信。保证金是一个简单的约束机制——你造假，押金就没了。
          </p>
        </div>

        {/* 缴纳规则 */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-light)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Wallet size={15} style={{ color: 'var(--color-success)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>
              缴纳规则
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                保证金金额
              </span>
              <span className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
                {depositPrice} 元
              </span>
            </div>
            <div
              className="text-xs text-center py-2 rounded-lg"
              style={{
                background: 'rgba(var(--color-success-rgb), 0.08)',
                color: 'var(--color-success)',
              }}
            >
              不到一杯奶茶钱，放心交友
            </div>
          </div>
        </div>

        {/* 分配方案 */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-light)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Users size={15} style={{ color: 'var(--color-success)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>
              {depositPrice}元分配方案
            </span>
          </div>
          <div className="space-y-2.5 text-xs">
            <div
              className="flex justify-between items-center py-2"
              style={{ borderBottom: '1px solid var(--color-bg-input)' }}
            >
              <span style={{ color: 'var(--color-text-muted)' }}>平台运营费（固定）</span>
              <span
                style={{ color: 'var(--color-text-primary)', fontWeight: 'bold', fontSize: '14px' }}
              >
                {platformFee} 元
              </span>
            </div>
            <div
              className="flex justify-between items-center py-2"
              style={{ borderBottom: '1px solid var(--color-bg-input)' }}
            >
              <span style={{ color: 'var(--color-text-muted)' }}>甲方感情损失费</span>
              <span style={{ color: 'var(--color-danger)', fontWeight: 'bold', fontSize: '14px' }}>
                {emotionalDamage} 元
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span style={{ color: 'var(--color-text-muted)' }}>乙方删除数据可退还</span>
              <span style={{ color: 'var(--color-success)', fontWeight: 'bold', fontSize: '14px' }}>
                {deleteRefund} 元
              </span>
            </div>
          </div>
        </div>

        {/* 两种情况 */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-light)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertOctagon size={15} style={{ color: 'var(--color-danger)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-danger)' }}>
              两种情况
            </span>
          </div>

          {/* 情况1：乙方造假 */}
          <div
            className="mb-4 p-3 rounded-lg"
            style={{ background: 'rgba(var(--color-danger-rgb), 0.05)' }}
          >
            <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-danger)' }}>
              👉 情况1：乙方造假
            </div>
            <div className="space-y-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <div>• 甲方投诉并上传证据</div>
              <div>• 平台核实属实后</div>
              <div>
                •{' '}
                <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>
                  甲方获得感情损失费 {emotionalDamage} 元
                </span>
              </div>
              <div>
                •{' '}
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 'bold' }}>
                  平台收取运营费 {platformFee} 元
                </span>
              </div>
              <div>
                •{' '}
                <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
                  乙方删除数据可退还 {deleteRefund} 元
                </span>
              </div>
            </div>
          </div>

          {/* 情况2：乙方没欺骗 */}
          <div
            className="p-3 rounded-lg"
            style={{ background: 'rgba(var(--color-success-rgb), 0.05)' }}
          >
            <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-success)' }}>
              ✅ 情况2：乙方没欺骗
            </div>
            <div className="space-y-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <div>
                •{' '}
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 'bold' }}>
                  平台运营费 {platformFee} 元不变
                </span>
              </div>
              <div>
                •{' '}
                <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>
                  甲方获得退还 {refundAfterNoFault} 元
                </span>
              </div>
              <div>• 大家好聚好散~</div>
            </div>
          </div>
        </div>

        {/* 退回规则 */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-light)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw size={15} style={{ color: 'var(--color-success)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>
              退回规则
            </span>
          </div>
          <div className="space-y-2 text-xs">
            <div
              className="flex items-center justify-between py-2"
              style={{ borderBottom: '1px solid var(--color-bg-input)' }}
            >
              <span style={{ color: 'var(--color-text-muted)' }}>主动删除自己的数据</span>
              <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>
                退还 {deleteRefund} 元
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span style={{ color: 'var(--color-text-muted)' }}>未被投诉且数据真实</span>
              <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>
                随时可申请全额退还
              </span>
            </div>
          </div>
        </div>

        {/* 真实案例 */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-light)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <FileCheck size={15} style={{ color: 'var(--color-primary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
              真实案例
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            小王在表格里填"身高180cm"，小李见面后发现他实际只有165cm。小李发起投诉，上传见面照片证据。平台核实后：小李获得
            <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>
              {emotionalDamage}元
            </span>
            感情损失费，平台收取
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 'bold' }}>
              {platformFee}元
            </span>
            运营费，小王删除数据后可拿回
            <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
              {deleteRefund}元
            </span>
            。
          </p>
        </div>

        {/* 投诉流程 */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-light)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Clock size={15} style={{ color: 'var(--color-success)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>
              投诉流程
            </span>
          </div>
          <div className="space-y-3">
            {[
              '见面后发现对方信息造假',
              '在对方资料页点击"投诉"按钮',
              '上传证据（照片/聊天记录等）',
              '平台24小时内核实',
              '核实属实，押金自动分配',
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-success), #5A9F6D)',
                    color: '#FFF',
                  }}
                >
                  {i + 1}
                </div>
                <span className="text-xs pt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 常见问题 */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-light)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle size={15} style={{ color: 'var(--color-success)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>
              常见问题
            </span>
          </div>
          <div className="space-y-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <div>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 'medium' }}>Q：</span>
              <span>保证金多久能退回？</span>
            </div>
            <div className="pl-4">
              <span style={{ color: 'var(--color-success)' }}>A：</span>
              <span>删除资料后立即原路退回。</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 'medium' }}>Q：</span>
              <span>什么情况算造假？</span>
            </div>
            <div className="pl-4">
              <span style={{ color: 'var(--color-success)' }}>A：</span>
              <span>身高/年龄/学历等关键信息与实际不符。</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 'medium' }}>Q：</span>
              <span>被投诉后还能退钱吗？</span>
            </div>
            <div className="pl-4">
              <span style={{ color: 'var(--color-success)' }}>A：</span>
              <span>删除自己的数据可退回{deleteRefund}元。</span>
            </div>
          </div>
        </div>

        {/* 恶意投诉 */}
        <div
          className="rounded-xl p-4 mb-6"
          style={{
            background: 'rgba(var(--color-danger-rgb), 0.03)',
            border: '1px solid var(--color-bg-pink)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Ban size={15} style={{ color: 'var(--color-danger)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-danger)' }}>
              恶意投诉
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            如果发现恶意投诉（见面没问题却故意投诉），平台有权驳回投诉，并对投诉方进行警告。多次恶意投诉者将被封禁。
          </p>
        </div>

        {/* 保证金状态显示 */}
        {!loadingStatus && depositStatus && (
          <div
            className="rounded-xl p-4 mb-4"
            style={{
              background:
                depositStatus.status === 'approved'
                  ? 'rgba(var(--color-success-rgb), 0.08)'
                  : depositStatus.status === 'rejected'
                    ? 'rgba(var(--color-danger-rgb), 0.05)'
                    : 'rgba(var(--color-primary-rgb), 0.05)',
              border:
                depositStatus.status === 'approved'
                  ? '1px solid #A5D6A7'
                  : depositStatus.status === 'rejected'
                    ? '1px solid #FFCDD2'
                    : '1px solid var(--color-bg-warm)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              {depositStatus.status === 'approved' ? (
                <CheckCircle size={15} style={{ color: 'var(--color-success)' }} />
              ) : depositStatus.status === 'rejected' ? (
                <AlertTriangle size={15} style={{ color: 'var(--color-danger)' }} />
              ) : (
                <Clock size={15} style={{ color: 'var(--color-primary)' }} />
              )}
              <span
                className="text-sm font-medium"
                style={{
                  color:
                    depositStatus.status === 'approved'
                      ? 'var(--color-success)'
                      : depositStatus.status === 'rejected'
                        ? 'var(--color-danger)'
                        : 'var(--color-primary)',
                }}
              >
                {depositStatus.status === 'approved'
                  ? '保证金已缴纳'
                  : depositStatus.status === 'rejected'
                    ? '审核未通过'
                    : '审核中'}
              </span>
            </div>
            {depositStatus.admin_note && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                备注：{depositStatus.admin_note}
              </p>
            )}
            {depositStatus.status === 'approved' && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-success)' }}>
                ✓ 您已获得完整浏览权限，可以查看所有用户联系方式
              </p>
            )}
            {depositStatus.status === 'rejected' && (
              <div className="mt-3">
                <button
                  onClick={() => setShowPayment(true)}
                  className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-all"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                  }}
                >
                  重新上传凭证
                </button>
              </div>
            )}
          </div>
        )}

        {/* 支付入口 */}
        <div
          className="rounded-xl p-4 mb-6"
          style={{
            background:
              'linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.08), rgba(217,106,77,0.05))',
            border: '1px solid var(--color-bg-warm)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Zap size={15} style={{ color: 'var(--color-primary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
              缴纳保证金
            </span>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            支付 {depositPrice} 元，支付成功后自动解锁联系方式，无需等待审核
          </p>
          <button
            onClick={() => setShowPayment(true)}
            className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all flex items-center justify-center gap-2"
            style={{
              background:
                'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
              boxShadow: '0 2px 12px rgba(var(--color-primary-rgb), 0.2)',
            }}
          >
            <Zap size={16} /> 立即支付
          </button>
        </div>

        {/* 支付弹窗 */}
        {showPayment && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setShowPayment(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl p-6"
              style={{ background: 'var(--color-bg-card)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3
                  className="text-lg font-semibold"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  缴纳保证金
                </h3>
                <button
                  onClick={() => setShowPayment(false)}
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
                  onClick={() => setPaymentMode('auto')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                    paymentMode === 'auto' ? 'text-white shadow' : 'text-gray-600 hover:bg-white/50'
                  }`}
                  style={
                    paymentMode === 'auto'
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
                  onClick={() => setPaymentMode('manual')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                    paymentMode === 'manual'
                      ? 'text-white shadow'
                      : 'text-gray-600 hover:bg-white/50'
                  }`}
                  style={
                    paymentMode === 'manual'
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
                    setSelectedMethod('alipay')
                    setQrError(false)
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    selectedMethod === 'alipay'
                      ? 'text-white shadow-lg'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={
                    selectedMethod === 'alipay'
                      ? {
                          background:
                            'linear-gradient(135deg, var(--color-alipay), var(--color-alipay-dark))',
                        }
                      : {}
                  }
                >
                  <span>支付宝</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedMethod('wechat')
                    setQrError(false)
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    selectedMethod === 'wechat'
                      ? 'text-white shadow-lg'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={
                    selectedMethod === 'wechat'
                      ? {
                          background:
                            'linear-gradient(135deg, var(--color-wechat), var(--color-wechat-dark))',
                        }
                      : {}
                  }
                >
                  <span>微信</span>
                </button>
              </div>

              {/* 自动支付模式 */}
              {paymentMode === 'auto' && (
                <>
                  <div
                    className="bg-white rounded-xl p-4 mb-4 text-center"
                    style={{ border: '1px solid var(--color-border-light)' }}
                  >
                    <p className="text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>
                      点击下方按钮，跳转到{selectedMethod === 'alipay' ? '支付宝' : '微信'}完成支付
                    </p>
                    <p className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
                      ¥{depositPrice}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>
                      支付成功后自动解锁，无需等待审核
                    </p>
                  </div>
                  {nativeQr && (
                    <div
                      className="bg-white rounded-xl p-4 mb-4 text-center"
                      style={{ border: '1px solid var(--color-border-light)' }}
                    >
                      <img
                        src={nativeQr}
                        alt="微信支付二维码"
                        className="mx-auto mb-2"
                        style={{ width: 200, height: 200 }}
                      />
                      <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        用微信扫一扫完成支付
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>
                        支付完成后本页自动解锁，不用刷新
                      </p>
                    </div>
                  )}
                  <button
                    onClick={handleAutoPayment}
                    disabled={creatingOrder}
                    className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{
                      background:
                        selectedMethod === 'alipay'
                          ? 'linear-gradient(135deg, var(--color-alipay), var(--color-alipay-dark))'
                          : 'linear-gradient(135deg, var(--color-wechat), var(--color-wechat-dark))',
                    }}
                  >
                    {creatingOrder ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        创建订单中...
                      </>
                    ) : (
                      <>
                        <Zap size={16} /> 立即支付 ¥{depositPrice}
                      </>
                    )}
                  </button>
                </>
              )}

              {/* 手动上传模式 */}
              {paymentMode === 'manual' && (
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
                            {selectedMethod === 'alipay' ? '支付宝' : '微信'}收款码加载失败
                          </p>
                          <p className="text-xs">请联系管理员获取</p>
                        </div>
                      ) : (
                        <img
                          src={`/${selectedMethod}-qr.png`}
                          alt={`${selectedMethod === 'alipay' ? '支付宝' : '微信'}收款码`}
                          className="w-full h-full object-contain"
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
                        扫码支付 {depositPrice} 元
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                        使用{selectedMethod === 'alipay' ? '支付宝' : '微信'}扫一扫
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
                      onChange={handleUploadProof}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: 'var(--color-border)' }}
                    />
                    {uploadedProof && (
                      <div
                        className="mt-2 text-xs flex items-center gap-2"
                        style={{ color: 'var(--color-success)' }}
                      >
                        <CheckCircle size={14} />
                        <span>已选择: {uploadedProof.name}</span>
                      </div>
                    )}
                  </div>

                  {/* 提交按钮 */}
                  <button
                    onClick={handleSubmitPayment}
                    disabled={!uploadedProof || uploading}
                    className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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

                  <p
                    className="text-xs mt-3 text-center"
                    style={{ color: 'var(--color-text-light)' }}
                  >
                    管理员将在24小时内审核，审核结果将通知您
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
