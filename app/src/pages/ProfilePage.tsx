import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router'
import {
  User,
  Camera,
  LogOut,
  ArrowLeft,
  Star,
  Edit2,
  ChevronRight,
  Settings,
  Trash2,
  Plus,
  X as XIcon,
} from 'lucide-react'
import { API_BASE_URL, normalizeAvatarUrl } from '../api/config'
import type { CustomField } from '../data/types'
import { handleApiError } from '../utils/errorHandler'
import { loadColumns } from '../services/user.service'
import { fetchFieldMappings } from '../services/field-mapping.service'
import type { Column, Row } from '../data/types'
import { getAuthToken } from '../utils/auth'
import { formatYuan } from '../utils/money'
import { useToast } from '../components/Toast'
import { computeProfileCompleteness } from '../utils/profile-completeness'
import { formatDraftAge } from '../services/draft.service'
import { useFormDraft } from '../utils/useFormDraft'
import { applyTagToggle, FORM_HIDDEN_KEYS } from '../utils/form-fields'

export default function ProfilePage() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [columns, setColumns] = useState<Column[]>(loadColumns)
  // 从后端拉取字段映射，统一数据源（API 不可用时保留本地默认值）
  useEffect(() => {
    fetchFieldMappings()
      .then((apiCols) => {
        setColumns((prev) => {
          const customCols = prev.filter((c) => c.category === 'custom')
          return [...apiCols, ...customCols]
        })
      })
      .catch(() => {})
  }, [])
  const [userData, setUserData] = useState<Row | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [selectedTags, setSelectedTags] = useState<Record<string, string[]>>({})
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [customFields, setCustomFields] = useState<{ field_key: string; field_value: string }[]>([])
  const [newFieldKey, setNewFieldKey] = useState('')
  const [newFieldValue, setNewFieldValue] = useState('')
  const [showAddField, setShowAddField] = useState(false)

  const userId = localStorage.getItem('user_id')
  const userNickname = localStorage.getItem('user_nickname')
  const authToken = getAuthToken()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const customFieldOriginalRef = useRef<Record<string, string>>({})
  // 草稿自动保存：仅在编辑态落盘，字段范围由 services/draft.service.ts 的白名单决定
  const { restoredAt, restore, afterSubmit, discard } = useFormDraft('profile', formData, editMode)

  const loadMyData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/my`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        if (data.user) {
          setUserData(data.user)
          const serverData: Record<string, string> = data.user.data || {}
          const draftValues = restore()
          const merged = draftValues ? { ...serverData, ...draftValues } : serverData
          setFormData(merged)
          if (draftValues) toast('已恢复上次未提交的草稿', 'info')
          const tags: Record<string, string[]> = {}
          Object.entries(merged).forEach(([key, val]) => {
            if (typeof val === 'string' && val.includes(',')) {
              tags[key] = val.split(',')
            }
          })
          setSelectedTags(tags)
          if (Array.isArray(data.user.custom_fields)) {
            setCustomFields(
              data.user.custom_fields.map((f: CustomField) => ({
                field_key: f.field_key,
                field_value: f.field_value,
              })),
            )
          }
        }
      } else {
        handleApiError(new Error('加载失败'), '获取个人信息失败')
      }
    } catch (e) {
      handleApiError(e, '网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  // 鉴权逻辑已由 App.tsx 中的 <RequireAuth> 守卫处理，此处只负责加载数据
  useEffect(() => {
    loadMyData()
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_id')
    localStorage.removeItem('user_phone')
    localStorage.removeItem('user_nickname')
    // 派发事件通知其他组件用户已退出
    window.dispatchEvent(new Event('user-logout'))
    navigate('/')
  }

  const handleSave = async () => {
    if (!formData.name) {
      toast('请填写昵称', 'error')
      return
    }

    const finalData = { ...formData }
    Object.entries(selectedTags).forEach(([key, tags]) => {
      if (tags.length > 0) finalData[key] = tags.join(',')
    })

    try {
      const res = await fetch(`${API_BASE_URL}/users/my`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ data: finalData }),
      })

      if (res.ok) {
        // 修改已落库，草稿必须清掉，否则下次进页面会拿旧草稿覆盖新数据
        afterSubmit()
        setEditMode(false)
        loadMyData()
      } else {
        const err = await res.json().catch(() => null)
        toast(err?.message || '保存失败', 'error')
        if (err?.code === 'need_certification') navigate('/deposit')
      }
    } catch (e) {
      toast('网络错误', 'error')
    }
  }

  const handleDelete = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/my`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      })

      if (res.ok) {
        handleLogout()
      } else {
        toast('删除失败', 'error')
      }
    } catch (e) {
      toast('网络错误', 'error')
    }
  }

  const setVal = (key: string, val: string) => setFormData((p) => ({ ...p, [key]: val }))

  const toggleTag = (key: string, tag: string) => {
    setSelectedTags((p) => ({ ...p, [key]: applyTagToggle(p[key] || [], key, tag) }))
  }

  const addCustomField = async () => {
    if (!newFieldKey.trim() || !newFieldValue.trim()) {
      toast('请填写标签名和标签值', 'error')
      return
    }
    try {
      const res = await fetch(`${API_BASE_URL}/users/custom-fields`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ field_key: newFieldKey.trim(), field_value: newFieldValue.trim() }),
      })
      if (res.ok) {
        setCustomFields((prev) => {
          const filtered = prev.filter((f) => f.field_key !== newFieldKey.trim())
          return [...filtered, { field_key: newFieldKey.trim(), field_value: newFieldValue.trim() }]
        })
        setNewFieldKey('')
        setNewFieldValue('')
        setShowAddField(false)
      } else {
        const data = await res.json().catch(() => ({}))
        toast(data.message || '添加失败', 'error')
      }
    } catch {
      toast('网络错误', 'error')
    }
  }

  const deleteCustomField = async (fieldKey: string) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/users/custom-fields/${encodeURIComponent(fieldKey)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${authToken}` },
        },
      )
      if (res.ok) {
        setCustomFields((prev) => prev.filter((f) => f.field_key !== fieldKey))
      } else {
        toast('删除失败', 'error')
      }
    } catch {
      toast('网络错误', 'error')
    }
  }

  const updateCustomFieldValue = async (fieldKey: string, newValue: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/custom-fields`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ field_key: fieldKey, field_value: newValue }),
      })
      if (res.ok) {
        setCustomFields((prev) =>
          prev.map((f) => (f.field_key === fieldKey ? { ...f, field_value: newValue } : f)),
        )
      } else {
        toast('保存失败', 'error')
      }
    } catch {
      toast('网络错误', 'error')
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      toast('请上传图片文件', 'error')
      return
    }

    // 验证文件大小（限制5MB）
    if (file.size > 5 * 1024 * 1024) {
      toast('图片大小不能超过5MB', 'error')
      return
    }

    // 先显示预览
    const reader = new FileReader()
    reader.onload = (ev) => {
      setAvatarPreview(ev.target?.result as string)
    }
    reader.readAsDataURL(file)

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)

      const res = await fetch(`${API_BASE_URL}/upload/avatar`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      })

      if (res.ok) {
        const result = await res.json()
        if (result.success) {
          // 重新加载用户数据
          await loadMyData()
          setAvatarPreview(null) // 清除预览
          toast('头像上传成功！', 'success')
        } else {
          toast(result.message || '上传失败', 'error')
        }
      } else {
        const errorData = await res.json().catch(() => ({}))
        toast(errorData.message || '上传失败，请重试', 'error')
      }
    } catch (e) {
      toast('网络错误，请检查网络连接后重试', 'error')
    } finally {
      setUploading(false)
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

  // 编辑态下 formData 会随输入变化，完整度条实时跟着走
  const completeness = computeProfileCompleteness(formData)

  // 年龄/星座/婚姻/兴趣标签由后端从生日、感情状态、兴趣+运动推导，表单不再追问
  const formColumns = columns.filter((col) => !FORM_HIDDEN_KEYS.has(col.key))

  return (
    <div className="min-h-screen pb-8" style={{ background: 'var(--color-bg-main)' }}>
      <div className="max-w-lg mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/"
            className="p-2 rounded-lg hover-warm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-lg font-medium" style={{ color: 'var(--color-text-primary)' }}>
            个人中心
          </h1>
          {editMode && (
            <button
              onClick={() => setEditMode(false)}
              className="ml-auto text-sm"
              style={{ color: 'var(--color-primary)' }}
            >
              取消
            </button>
          )}
        </div>

        {/* 资料完整度提示条：分母是头像/昵称/性别/城市/职业这 5 个门面字段（见 utils/profile-completeness.ts） */}
        <div
          className="rounded-xl px-4 py-3 mb-4"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-light)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
              资料完整度
            </span>
            <span className="text-xs" style={{ color: 'var(--color-primary)' }}>
              {completeness.filled}/{completeness.total} · {completeness.percent}%
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden mt-2"
            style={{ background: 'var(--color-border-light)' }}
            role="progressbar"
            aria-valuenow={completeness.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="资料完整度"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${completeness.percent}%`,
                background:
                  'linear-gradient(90deg, var(--color-primary), var(--color-primary-dark))',
                transition: 'width 0.25s ease',
              }}
            />
          </div>
          {completeness.missing.length > 0 ? (
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              还差：{completeness.missing.join('、')}
            </p>
          ) : (
            <p className="text-xs mt-2" style={{ color: 'var(--color-success)' }}>
              资料已完整
            </p>
          )}
          {restoredAt && (
            <div
              className="flex items-center justify-between gap-2 mt-2 pt-2"
              style={{ borderTop: '1px dashed var(--color-border-light)' }}
            >
              <span className="text-xs" style={{ color: 'var(--color-success)' }}>
                已恢复 {formatDraftAge(restoredAt)}保存的未提交草稿
              </span>
              <button
                onClick={() => {
                  discard()
                  setEditMode(false)
                  loadMyData()
                  toast('已放弃草稿', 'info')
                }}
                className="shrink-0 text-xs px-2 py-1 rounded-lg"
                style={{
                  color: 'var(--color-text-muted)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-input)',
                }}
              >
                放弃草稿
              </button>
            </div>
          )}
        </div>

        {userData ? (
          <>
            <div
              className="rounded-2xl p-5 mb-4"
              style={{
                background: 'linear-gradient(180deg, var(--color-bg-card), #FDF8F1)',
                border: '1px solid var(--color-border-light)',
              }}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleAvatarUpload}
                  />
                  {/* 显示头像或照片 - 与Home.tsx保持一致风格 */}
                  {avatarPreview || normalizeAvatarUrl(userData.data?.avatar) ? (
                    <div
                      className="w-14 h-14 rounded-2xl avatar-gradient overflow-hidden cursor-pointer relative group"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <img
                        src={avatarPreview || normalizeAvatarUrl(userData.data?.avatar) || ''}
                        alt="头像"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.onerror = null
                          target.src = ''
                        }}
                      />
                      {uploading && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                      {!uploading && (
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <Camera size={18} color="white" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className="w-14 h-14 rounded-2xl avatar-gradient flex items-center justify-center text-xl font-semibold cursor-pointer hover:opacity-80 transition-opacity relative group"
                      style={{ color: 'white' }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {String(userData.data?.name || userNickname || '?')[0]}
                      {!uploading && (
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-2xl">
                          <Camera size={18} color="white" />
                        </div>
                      )}
                      {uploading && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 rounded-2xl flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {userData.data?.name || userNickname}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    注册时间: {new Date(userData.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                </div>
                {!editMode && (
                  <button
                    onClick={() => setEditMode(true)}
                    className="p-2 rounded-lg"
                    style={{
                      color: 'var(--color-primary)',
                      background: 'rgba(var(--color-primary-rgb), 0.08)',
                    }}
                  >
                    <Edit2 size={16} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => navigate('/deposit')}
                  className="text-center p-3 rounded-xl cursor-pointer"
                  style={{ background: '#FDF8F1', border: '1px solid var(--color-border-light)' }}
                >
                  <div className="text-lg font-semibold" style={{ color: 'var(--color-primary)' }}>
                    {formatYuan(userData.deposit || 0)}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    认证费(元)
                  </div>
                </button>
                <div
                  className="text-center p-3 rounded-xl"
                  style={{ background: '#FDF8F1', border: '1px solid var(--color-border-light)' }}
                >
                  <div className="text-lg font-semibold" style={{ color: 'var(--color-success)' }}>
                    {userData.data?.hobbies ? userData.data.hobbies.split(',').length : 0}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    兴趣标签
                  </div>
                </div>
                <div
                  className="text-center p-3 rounded-xl"
                  style={{ background: '#FDF8F1', border: '1px solid var(--color-border-light)' }}
                >
                  <div
                    className="text-lg font-semibold"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {userData.data?.purpose || '未设置'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    目的
                  </div>
                </div>
              </div>
            </div>

            {editMode ? (
              <div className="space-y-3">
                {formColumns.map((col) => {
                  if (col.type === 'tags') {
                    return (
                      <div key={col.key}>
                        <label
                          className="text-xs mb-2 block"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          {col.label}
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {(col.options || []).map((opt) => {
                            const isOn = (selectedTags[col.key] || []).includes(opt)
                            return (
                              <button
                                key={opt}
                                onClick={() => toggleTag(col.key, opt)}
                                className="px-3 py-1.5 rounded-lg text-xs transition-all"
                                style={{
                                  background: isOn
                                    ? 'rgba(var(--color-primary-rgb), 0.08)'
                                    : '#FDF8F1',
                                  border: `1px solid ${isOn ? '#F5B8A4' : 'var(--color-border-light)'}`,
                                  color: isOn
                                    ? 'var(--color-primary)'
                                    : 'var(--color-text-secondary)',
                                }}
                              >
                                {opt}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }

                  if (col.type === 'select') {
                    return (
                      <div key={col.key}>
                        <label
                          className="text-xs mb-1.5 block"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          {col.label}
                        </label>
                        <select
                          className="w-full px-3 py-2.5 rounded-lg text-sm appearance-none"
                          style={{
                            background: 'var(--color-bg-input)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-primary)',
                            outline: 'none',
                          }}
                          value={String(formData[col.key] || '')}
                          onChange={(e) => setVal(col.key, e.target.value)}
                        >
                          <option value="" style={{ background: 'var(--color-bg-card)' }}>
                            请选择
                          </option>
                          {(col.options || []).map((o) => (
                            <option
                              key={o}
                              value={o}
                              style={{ background: 'var(--color-bg-card)' }}
                            >
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  }

                  return (
                    <div key={col.key}>
                      <label
                        className="text-xs mb-1.5 block"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {col.label}
                      </label>
                      <input
                        className="w-full px-3 py-2.5 rounded-lg text-sm"
                        style={{
                          background: 'var(--color-bg-input)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-primary)',
                          outline: 'none',
                        }}
                        type="text"
                        placeholder={`输入${col.label}`}
                        value={String(formData[col.key] || '')}
                        onChange={(e) => setVal(col.key, e.target.value)}
                      />
                    </div>
                  )
                })}

                {/* 自定义标签管理 */}
                <div
                  className="rounded-xl p-4 mt-2"
                  style={{
                    background: 'rgba(var(--color-success-rgb), 0.04)',
                    border: '1px solid rgba(var(--color-success-rgb), 0.15)',
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium" style={{ color: 'var(--color-success)' }}>
                      我的自定义标签
                    </span>
                    <button
                      onClick={() => setShowAddField(!showAddField)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                      style={{
                        color: 'var(--color-success)',
                        border: '1px solid rgba(var(--color-success-rgb), 0.2)',
                      }}
                    >
                      <Plus size={10} /> 添加
                    </button>
                  </div>

                  {customFields.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {customFields.map((cf) => (
                        <div key={cf.field_key} className="flex items-center gap-2">
                          <span
                            className="text-xs px-2 py-1 rounded-md"
                            style={{
                              background: 'rgba(var(--color-success-rgb), 0.08)',
                              color: 'var(--color-success)',
                            }}
                          >
                            {cf.field_key}
                          </span>
                          <input
                            className="flex-1 px-2 py-1 rounded-lg text-xs"
                            style={{
                              background: 'var(--color-bg-input)',
                              border: '1px solid var(--color-border)',
                              color: 'var(--color-text-primary)',
                              outline: 'none',
                            }}
                            value={cf.field_value}
                            onChange={(e) => {
                              setCustomFields((prev) =>
                                prev.map((f) =>
                                  f.field_key === cf.field_key
                                    ? { ...f, field_value: e.target.value }
                                    : f,
                                ),
                              )
                            }}
                            onFocus={() => {
                              customFieldOriginalRef.current[cf.field_key] = cf.field_value
                            }}
                            onBlur={(e) => {
                              const original = customFieldOriginalRef.current[cf.field_key]
                              if (e.target.value !== original) {
                                updateCustomFieldValue(cf.field_key, e.target.value)
                              }
                            }}
                          />
                          <button
                            onClick={() => deleteCustomField(cf.field_key)}
                            className="p-1 rounded"
                            style={{ color: 'var(--color-primary-dark)' }}
                          >
                            <XIcon size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {customFields.length === 0 && !showAddField && (
                    <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                      还没有自定义标签，点击"添加"创建
                    </p>
                  )}

                  {showAddField && (
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs"
                        style={{
                          background: 'var(--color-bg-input)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-primary)',
                          outline: 'none',
                        }}
                        placeholder="标签名（如：最爱颜色）"
                        value={newFieldKey}
                        onChange={(e) => setNewFieldKey(e.target.value)}
                      />
                      <input
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs"
                        style={{
                          background: 'var(--color-bg-input)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-primary)',
                          outline: 'none',
                        }}
                        placeholder="标签值（如：蓝色）"
                        value={newFieldValue}
                        onChange={(e) => setNewFieldValue(e.target.value)}
                      />
                      <button
                        onClick={addCustomField}
                        className="text-xs px-3 py-1.5 rounded-lg text-white"
                        style={{
                          background: 'linear-gradient(135deg, var(--color-success), #4D945F)',
                        }}
                      >
                        确定
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleSave}
                  className="w-full py-3.5 rounded-xl text-sm font-medium text-white mt-4"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                    boxShadow: '0 2px 12px rgba(var(--color-primary-rgb), 0.2)',
                  }}
                >
                  保存修改
                </button>
              </div>
            ) : (
              <div
                className="rounded-2xl p-5"
                style={{
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-light)',
                }}
              >
                <h3
                  className="text-sm font-medium mb-3"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  我的资料
                </h3>
                <div className="space-y-2">
                  {columns
                    .filter((c) => {
                      const val = userData.data?.[c.key as keyof typeof userData.data]
                      return c.key !== 'contact' && val && String(val).trim()
                    })
                    .map((col) => {
                      const val = String(userData.data?.[col.key as keyof typeof userData.data])
                      return (
                        <div
                          key={col.key}
                          className="flex items-center justify-between py-2"
                          style={{ borderBottom: '1px solid var(--color-border-light)' }}
                        >
                          <span
                            className="text-xs"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {col.label}
                          </span>
                          <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                            {val}
                          </span>
                        </div>
                      )
                    })}
                  {customFields.length > 0 && (
                    <>
                      <div
                        className="py-2 mt-1"
                        style={{ borderTop: '1px solid var(--color-border-light)' }}
                      >
                        <span
                          className="text-xs font-medium"
                          style={{ color: 'var(--color-success)' }}
                        >
                          自定义标签
                        </span>
                      </div>
                      {customFields.map((cf) => (
                        <div
                          key={cf.field_key}
                          className="flex items-center justify-between py-2"
                          style={{ borderBottom: '1px solid var(--color-border-light)' }}
                        >
                          <span
                            className="text-xs"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {cf.field_key}
                          </span>
                          <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                            {cf.field_value}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-light)',
            }}
          >
            <User size={48} style={{ color: 'var(--color-border-light)', margin: '0 auto' }} />
            <p className="mt-4 mb-4" style={{ color: 'var(--color-text-muted)' }}>
              还没有发布过资料
            </p>
            <Link
              to="/post"
              className="inline-block px-6 py-2.5 rounded-xl text-sm text-white"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
              }}
            >
              发布资料
            </Link>
          </div>
        )}

        <div className="mt-4 space-y-2">
          <Link
            to="/my-posts"
            className="flex items-center justify-between p-4 rounded-xl"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-light)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(var(--color-primary-rgb), 0.08)' }}
              >
                <Star size={14} style={{ color: 'var(--color-primary)' }} />
              </div>
              <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                我的发布
              </span>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--color-text-secondary)' }} />
          </Link>

          <Link
            to="/settings"
            className="flex items-center justify-between p-4 rounded-xl"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-light)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(var(--color-success-rgb), 0.08)' }}
              >
                <Settings size={14} style={{ color: 'var(--color-success)' }} />
              </div>
              <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                设置
              </span>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--color-text-secondary)' }} />
          </Link>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-between p-4 rounded-xl"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-light)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(212,133,106,0.08)' }}
              >
                <LogOut size={14} style={{ color: 'var(--color-primary-dark)' }} />
              </div>
              <span className="text-sm" style={{ color: 'var(--color-primary-dark)' }}>
                退出登录
              </span>
            </div>
          </button>

          {userData && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full flex items-center justify-between p-4 rounded-xl"
              style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border-light)',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(220,38,38,0.05)' }}
                >
                  <Trash2 size={14} style={{ color: '#DC2626' }} />
                </div>
                <span className="text-sm" style={{ color: '#DC2626' }}>
                  删除账号
                </span>
              </div>
            </button>
          )}
        </div>
      </div>

      {showDeleteModal && (
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
              删除账号
            </h3>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
              确定要删除您的账号吗？此操作不可恢复，已缴的认证费不予退还。
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white"
                style={{ background: '#DC2626' }}
              >
                确认删除
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
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
