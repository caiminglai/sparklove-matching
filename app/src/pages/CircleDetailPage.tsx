import { useState, useEffect, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router'
import {
  Heart,
  Users,
  Sparkles,
  Utensils,
  Dumbbell,
  Music,
  MapPin,
  ChevronLeft,
} from 'lucide-react'
import { API_BASE_URL, normalizeAvatarUrl } from '../api/config'
import type { Row } from '../data/types'
import ImagePreview from '../components/ImagePreview'
import { maskContact } from '../utils/mask'
import { usePricing } from '../utils/pricing'
import { hexToRgba } from '../utils/color'
import { useToast } from '../components/Toast'
import { getAuthHeaders } from '../utils/auth'

// 客服微信号配置（从环境变量读取，避免硬编码在前端代码）
const CUSTOMER_SERVICE_WECHAT = import.meta.env.VITE_CUSTOMER_SERVICE_WECHAT || 'chanmiao0430'

const CIRCLE_CONFIGS: Record<string, { label: string; icon: typeof Heart; color: string }> = {
  hobbies: { label: '兴趣圈', icon: Sparkles, color: 'var(--color-primary)' },
  food: { label: '美食圈', icon: Utensils, color: 'var(--color-primary)' },
  sport: { label: '运动圈', icon: Dumbbell, color: 'var(--color-success)' },
  music: { label: '音乐圈', icon: Music, color: 'var(--color-info)' },
  city: { label: '同城圈', icon: MapPin, color: 'var(--color-info)' },
  personality: { label: '性格圈', icon: Heart, color: 'var(--color-primary)' },
}

export default function CircleDetailPage() {
  const { toast } = useToast()
  const { circleKey, tag } = useParams()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [showDetail, setShowDetail] = useState<string | null>(null)
  const [showPayModal, setShowPayModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const unlockPrice = usePricing().contact_unlock_amount

  const decodedTag = decodeURIComponent(tag || '')
  const config = CIRCLE_CONFIGS[circleKey || ''] || CIRCLE_CONFIGS.hobbies
  const Icon = config.icon

  useEffect(() => {
    const headers = getAuthHeaders()

    fetch(`${API_BASE_URL}/circles/members`, { headers })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setRows(data.data)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const circleUsers = useMemo(
    () =>
      rows.filter((r) => {
        const val = String(r.data?.[circleKey as keyof typeof r.data] || '')
        return val.includes(decodedTag)
      }),
    [rows, circleKey, decodedTag],
  )

  const detailRow = showDetail ? rows.find((r) => r.id === showDetail) : null
  const detailData = detailRow?.data

  return (
    <div className="min-h-screen pb-8" style={{ background: 'var(--color-bg-main)' }}>
      <div className="max-w-3xl mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/circles')}
            className="p-2 rounded-lg hover-warm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <ChevronLeft size={20} />
          </button>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${config.color}, ${hexToRgba(config.color, 0.8)})`,
              boxShadow: `0 2px 8px ${hexToRgba(config.color, 0.25)}`,
            }}
          >
            <Icon size={18} color="white" />
          </div>
          <div>
            <h1 className="text-lg font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {decodedTag}
            </h1>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {config.label} · {circleUsers.length}位圈友
            </p>
          </div>
        </div>

        {/* Banner */}
        <div
          className="rounded-2xl p-5 mb-5"
          style={{
            background: `linear-gradient(135deg, ${hexToRgba(config.color, 0.06)}, ${hexToRgba(config.color, 0.02)})`,
            border: `1px solid ${hexToRgba(config.color, 0.12)}`,
          }}
        >
          <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
            <span style={{ color: config.color, fontWeight: 600 }}>{decodedTag}</span> 圈的圈友们
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            每个人既是自己的圈子，又是别人的圈子。在这里，找到与你同频的人。
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              加载中...
            </p>
          </div>
        )}

        {/* User Cards */}
        {!loading && (
          <div className="space-y-2">
            {circleUsers.map((user) => (
              <div
                key={user.id}
                className="rounded-xl p-4 cursor-pointer transition-all"
                style={{
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-light)',
                }}
                onClick={() => setShowDetail(user.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = hexToRgba(config.color, 0.25)
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-light)'
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 overflow-hidden cursor-pointer relative"
                    style={{
                      background: hexToRgba(config.color, 0.06),
                      color: config.color,
                      border: `1px solid ${hexToRgba(config.color, 0.15)}`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (user.data?.avatar)
                        setPreviewImage(normalizeAvatarUrl(user.data.avatar) || '')
                    }}
                  >
                    {/* 总是显示名字首字母作为背景 */}
                    <span className="absolute inset-0 flex items-center justify-center">
                      {String(user.data?.name || '?')[0]}
                    </span>

                    {/* 如果有头像，显示在最上面 */}
                    {user.data?.avatar && (
                      <img
                        src={normalizeAvatarUrl(user.data.avatar) || undefined}
                        alt={user.data?.name || '用户头像'}
                        className="w-full h-full object-cover absolute inset-0"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.onerror = null
                          target.style.display = 'none'
                        }}
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-medium"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {user.data?.name || '匿名'}
                      </span>
                      {user.data?.gender && (
                        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          {user.data.gender}
                        </span>
                      )}
                      {user.data?.age && (
                        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          {user.data.age}岁
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {user.data?.city && (
                        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          {user.data.city}
                        </span>
                      )}
                      {user.data?.purpose && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: hexToRgba(config.color, 0.03),
                            color: config.color,
                            border: `1px solid ${hexToRgba(config.color, 0.1)}`,
                          }}
                        >
                          {user.data.purpose}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tags preview */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(user.data || {})
                    .filter(
                      ([k, v]) =>
                        k !== 'name' &&
                        k !== 'contact' &&
                        k !== 'purpose' &&
                        k !== 'gender' &&
                        k !== 'age' &&
                        v &&
                        String(v).trim(),
                    )
                    .slice(0, 5)
                    .map(([key, val]) => (
                      <span
                        key={key}
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-xs"
                        style={{
                          background: '#FDF8F1',
                          border: '1px solid var(--color-border-light)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {String(val).length > 10 ? String(val).slice(0, 10) + '...' : String(val)}
                      </span>
                    ))}
                </div>
              </div>
            ))}

            {circleUsers.length === 0 && (
              <div className="text-center py-12">
                <Users size={28} style={{ color: 'var(--color-border-light)', margin: '0 auto' }} />
                <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  这个圈子还没有人
                </p>
                <Link
                  to="/post"
                  className="inline-block mt-3 text-sm px-4 py-2 rounded-lg text-white"
                  style={{
                    background: `linear-gradient(135deg, ${config.color}, ${hexToRgba(config.color, 0.8)})`,
                  }}
                >
                  成为第一个圈友
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetail && detailData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end"
          style={{ background: 'rgba(var(--color-text-dark-rgb), 0.3)' }}
          onClick={() => setShowDetail(null)}
        >
          <div
            className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl p-5"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-light)',
              boxShadow: '0 8px 32px rgba(var(--color-text-dark-rgb), 0.12)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium" style={{ color: 'var(--color-text-primary)' }}>
                详细资料
              </h3>
              <button
                onClick={() => setShowDetail(null)}
                className="p-1.5 rounded-md hover-warm"
                style={{ color: 'var(--color-text-muted)' }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold overflow-hidden cursor-pointer relative"
                  style={{
                    background: hexToRgba(config.color, 0.06),
                    color: config.color,
                    border: `1px solid ${hexToRgba(config.color, 0.15)}`,
                  }}
                  onClick={() => {
                    if (detailData.avatar)
                      setPreviewImage(normalizeAvatarUrl(detailData.avatar) || '')
                  }}
                >
                  {/* 总是显示名字首字母作为背景 */}
                  <span className="absolute inset-0 flex items-center justify-center">
                    {String(detailData.name || '?')[0]}
                  </span>

                  {/* 如果有头像，显示在最上面 */}
                  {detailData.avatar && (
                    <img
                      src={normalizeAvatarUrl(detailData.avatar) || undefined}
                      alt={detailData.name || '用户头像'}
                      className="w-full h-full object-cover absolute inset-0"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.onerror = null
                        target.style.display = 'none'
                      }}
                    />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-medium"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {detailData.name || '匿名'}
                    </span>
                    {detailData.gender && (
                      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {detailData.gender}
                      </span>
                    )}
                    {detailData.age && (
                      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {detailData.age}岁
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {detailData.city && (
                      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {detailData.city}
                      </span>
                    )}
                    {detailData.purpose && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: hexToRgba(config.color, 0.03),
                          color: config.color,
                          border: `1px solid ${hexToRgba(config.color, 0.1)}`,
                        }}
                      >
                        {detailData.purpose}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* All tags */}
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(detailData)
                  .filter(
                    ([k, v]) =>
                      k !== 'name' && k !== 'contact' && k !== 'purpose' && v && String(v).trim(),
                  )
                  .map(([key, val]) => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs"
                      style={{
                        background: '#FDF8F1',
                        border: '1px solid var(--color-border-light)',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {String(val)}
                    </span>
                  ))}
              </div>

              {/* Circles this person belongs to */}
              <div
                className="mt-4 p-3 rounded-xl"
                style={{
                  background: hexToRgba(config.color, 0.02),
                  border: `1px solid ${hexToRgba(config.color, 0.08)}`,
                }}
              >
                <div className="text-xs font-medium mb-2" style={{ color: config.color }}>
                  TA的圈子
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(CIRCLE_CONFIGS).map(([key, cfg]) => {
                    const val = String(detailData[key as keyof typeof detailData] || '')
                    if (!val) return null
                    const tags = val
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                    return tags.map((t) => (
                      <span
                        key={`${key}-${t}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs cursor-pointer"
                        style={{
                          background: `${cfg.color}08`,
                          color: cfg.color,
                          border: `1px solid ${cfg.color}18`,
                        }}
                        onClick={() => navigate(`/circle/${key}/${encodeURIComponent(t)}`)}
                      >
                        {t}
                      </span>
                    ))
                  })}
                </div>
              </div>

              {detailData.contact && (
                <div
                  className="p-3 rounded-xl"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.06), rgba(var(--color-primary-rgb), 0.02))',
                    border: '1px solid rgba(var(--color-primary-rgb), 0.12)',
                  }}
                >
                  <div
                    className="text-xs font-semibold mb-1"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    联系方式
                  </div>
                  <div
                    className="text-sm font-medium"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {maskContact(detailData.contact)}
                  </div>
                  <button
                    onClick={() => setShowPayModal(true)}
                    className="mt-2 w-full py-2 rounded-lg text-xs font-medium"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--color-primary), var(--color-star))',
                      color: '#fff',
                    }}
                  >
                    💰 支付 {unlockPrice} 元查看完整联系方式
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPayModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowPayModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-80 max-w-[90%] mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="text-lg font-bold mb-2 text-center"
              style={{ color: 'var(--color-primary)' }}
            >
              查看联系方式
            </h3>
            <p className="text-sm text-center mb-4" style={{ color: '#666' }}>
              支付 {unlockPrice} 元后，即可查看完整联系方式
              <br />
              <span className="text-xs" style={{ color: '#999' }}>
                （转账后截图发给客服，客服手动解锁）
              </span>
            </p>
            <div className="flex flex-col gap-3">
              <div
                className="p-3 rounded-xl text-center cursor-pointer"
                style={{ background: '#f8f9fa' }}
                onClick={() => setPreviewImage(`/wechat-qr.png`)}
              >
                <div className="text-xs mb-1 font-medium" style={{ color: '#666' }}>
                  微信支付
                </div>
                <img
                  src={`/wechat-qr.png`}
                  alt="微信收款码"
                  className="w-40 h-40 mx-auto rounded-lg"
                  style={{ objectFit: 'cover' }}
                />
              </div>
              <div
                className="p-3 rounded-xl text-center cursor-pointer"
                style={{ background: '#f8f9fa' }}
                onClick={() => setPreviewImage(`/alipay-qr.png`)}
              >
                <div className="text-xs mb-1 font-medium" style={{ color: '#666' }}>
                  支付宝
                </div>
                <img
                  src={`/alipay-qr.png`}
                  alt="支付宝收款码"
                  className="w-40 h-40 mx-auto rounded-lg"
                  style={{ objectFit: 'cover' }}
                />
              </div>
            </div>
            <p
              className="text-xs text-center mt-3"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              支付完成后截图发给客服解锁
            </p>
            <button
              onClick={() => {
                navigator.clipboard
                  .writeText(CUSTOMER_SERVICE_WECHAT)
                  .then(() => toast(`客服微信号已复制: ${CUSTOMER_SERVICE_WECHAT}`, 'success'))
              }}
              className="mt-2 w-full py-2 rounded-xl text-xs font-medium"
              style={{
                background: '#FFF5E8',
                color: 'var(--color-primary)',
                border: '1px solid #F5D4C0',
              }}
            >
              联系客服微信：{CUSTOMER_SERVICE_WECHAT}（点击复制）
            </button>
            <button
              onClick={() => setShowPayModal(false)}
              className="mt-3 w-full py-2.5 rounded-xl text-sm font-medium"
              style={{ background: '#f0f0f0', color: '#666' }}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      <ImagePreview
        src={previewImage || ''}
        alt="图片预览"
        isOpen={!!previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  )
}
