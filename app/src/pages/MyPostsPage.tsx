import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, FileText, Trash2, Clock, Plus } from 'lucide-react'
import { API_BASE_URL, normalizeAvatarUrl } from '../api/config'
import { loadColumns } from '../services/user.service'
import type { Row } from '../data/types'
import { useToast } from '../components/Toast'
import { getAuthToken } from '../utils/auth'

export default function MyPostsPage() {
  const { toast } = useToast()
  // 修复：原 const columns = loadColumns() 在函数体内直接调用，每次渲染都重读 localStorage + JSON.parse
  // 改为 useState 初始化器，仅在首次挂载时执行一次
  const [columns] = useState(loadColumns)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [showDelModal, setShowDelModal] = useState<string | null>(null)

  const userId = localStorage.getItem('user_id')
  const authToken = getAuthToken()

  // 鉴权逻辑已由 App.tsx 中的 <RequireAuth> 守卫处理，此处只负责加载数据
  useEffect(() => {
    loadMyPosts()
  }, [])

  const loadMyPosts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/my`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        if (data.user) {
          // 将用户数据包装成 Row 格式
          const myRow: Row = {
            id: data.user.id,
            data: data.user.data || {},
            deposit: data.user.deposit || 0,
            createdAt: data.user.createdAt,
            user_id: data.user.user_id,
          }
          setRows([myRow])
        }
      }
    } catch (e) {
      console.warn('加载帖子失败', e)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id))
        setShowDelModal(null)
      } else {
        toast('删除失败', 'error')
      }
    } catch (e) {
      toast('网络错误', 'error')
    }
  }

  if (!userId) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-bg-main)' }}
      >
        <div className="text-center">
          <p className="mb-4" style={{ color: 'var(--color-text-muted)' }}>
            请先登录
          </p>
          <Link
            to="/login"
            className="px-6 py-2 rounded-lg text-white text-sm"
            style={{
              background:
                'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
            }}
          >
            登录
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-bg-main)' }}
      >
        <p style={{ color: 'var(--color-text-secondary)' }}>加载中...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-8" style={{ background: 'var(--color-bg-main)' }}>
      <div className="max-w-lg mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/profile"
            className="p-2 rounded-lg hover-warm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-lg font-medium" style={{ color: 'var(--color-text-primary)' }}>
            我的发布
          </h1>
        </div>

        {rows.length > 0 ? (
          <div className="space-y-3">
            {rows.map((row) => {
              const visibleCols = columns.filter((c) => {
                const val = row.data?.[c.key as keyof typeof row.data]
                return c.key !== 'contact' && val && String(val).trim()
              })

              return (
                <div
                  key={row.id}
                  className="rounded-2xl p-4"
                  style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border-light)',
                  }}
                >
                  {/* 头像+名字 */}
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-12 h-12 rounded-2xl avatar-gradient flex items-center justify-center text-lg font-bold overflow-hidden"
                      style={{ color: 'white' }}
                    >
                      {normalizeAvatarUrl(row.data?.avatar) ? (
                        <img
                          src={normalizeAvatarUrl(row.data?.avatar) || ''}
                          alt="头像"
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        String(row.data?.name || '?')[0]
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {row.data?.name || '匿名'}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          <Clock size={10} className="inline mr-1" />
                          {new Date(row.createdAt).toLocaleDateString('zh-CN')}
                        </span>
                        {row.deposit > 0 && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              background: 'rgba(var(--color-success-rgb), 0.08)',
                              color: 'var(--color-success)',
                            }}
                          >
                            保证金 ¥{row.deposit}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setShowDelModal(row.id)}
                      className="p-2 rounded-lg hover-warm transition-colors"
                      style={{ color: 'var(--color-text-muted)' }}
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* 标签 */}
                  <div className="flex flex-wrap gap-1.5">
                    {visibleCols.slice(0, 8).map((col) => {
                      const val = String(row.data?.[col.key as keyof typeof row.data])
                      return (
                        <span
                          key={col.key}
                          className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium"
                          style={{
                            background: 'rgba(var(--color-primary-rgb), 0.06)',
                            color: 'var(--color-text-muted)',
                            border: '1px solid rgba(var(--color-border-warm-rgb), 0.6)',
                          }}
                        >
                          {col.label}: {val.length > 10 ? val.slice(0, 10) + '...' : val}
                        </span>
                      )
                    })}
                    {visibleCols.length > 8 && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium"
                        style={{
                          background: 'rgba(var(--color-primary-rgb), 0.06)',
                          color: 'var(--color-primary)',
                        }}
                      >
                        +{visibleCols.length - 8}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {/* 统计 */}
            <div
              className="rounded-2xl p-4 mt-4"
              style={{
                background: 'linear-gradient(180deg, var(--color-bg-card), #FDF8F1)',
                border: '1px solid var(--color-border-light)',
              }}
            >
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--color-primary)' }}>
                    {rows.length}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    发布数
                  </div>
                </div>
                <div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--color-success)' }}>
                    {rows.reduce((s, r) => s + (r.deposit || 0), 0)}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    保证金(元)
                  </div>
                </div>
                <div>
                  <div
                    className="text-lg font-semibold"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {rows.filter((r) => r.data?.avatar).length}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    有照片
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(var(--color-primary-rgb), 0.06)' }}
            >
              <FileText size={28} style={{ color: 'var(--color-primary)', opacity: 0.4 }} />
            </div>
            <p
              className="text-sm font-medium mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              还没有发布过资料
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
              发布资料让更多人看到你
            </p>
            <Link
              to="/post"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-sm font-medium"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
              }}
            >
              <Plus size={14} /> 发布资料
            </Link>
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {showDelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(var(--color-text-dark-rgb), 0.3)' }}
        >
          <div
            className="rounded-2xl p-5 w-full max-w-sm"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-light)',
              boxShadow: '0 8px 32px rgba(var(--color-text-dark-rgb), 0.12)',
            }}
          >
            <h3 className="text-sm font-medium mb-2" style={{ color: '#DC2626' }}>
              删除资料
            </h3>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
              确定要删除这条资料吗？如果已缴纳保证金，将全额退回。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDelete(showDelModal)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white"
                style={{ background: '#DC2626' }}
              >
                确认删除
              </button>
              <button
                onClick={() => setShowDelModal(null)}
                className="flex-1 py-2.5 rounded-lg text-sm"
                style={{
                  background: 'var(--color-bg-input)',
                  color: 'var(--color-text-muted)',
                  border: '1px solid var(--color-border)',
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
