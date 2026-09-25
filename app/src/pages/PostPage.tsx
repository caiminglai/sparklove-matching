import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { loadColumns, loadRows, addRow } from '../services/user.service';
import type { Row } from '../data/types';
import { API_BASE_URL, normalizeAvatarUrl } from '../api/config';
import { useToast } from '../components/Toast';
import { getAuthToken } from '../utils/auth';
import { formatDraftAge } from '../services/draft.service';
import { useFormDraft } from '../utils/useFormDraft';

export default function PostPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [columns] = useState(() => loadColumns());
  const [data, setData] = useState<Record<string, string | number>>({});
  const [selectedTags, setSelectedTags] = useState<Record<string, string[]>>({});

  const userId = localStorage.getItem('user_id');
  const authToken = getAuthToken();
  // 鉴权逻辑已由 App.tsx 中的 <RequireAuth> 守卫处理，此处不再重复
  // 草稿自动保存：只落盘 services/draft.service.ts 白名单里的字段（联系方式/头像/生日等一律不存）
  const { restoredAt, restore, afterSubmit, discard } = useFormDraft('post', data, true);

  // 进页面时尝试恢复上次未提交的草稿（超过 7 天的草稿由 loadDraft 直接丢弃并清理）
  useEffect(() => {
    const draftValues = restore();
    if (!draftValues) return;
    setData(draftValues);
    const tags: Record<string, string[]> = {};
    Object.entries(draftValues).forEach(([key, val]) => {
      if (typeof val === 'string' && val.includes(',')) tags[key] = val.split(',');
    });
    setSelectedTags(tags);
    toast('已恢复上次未提交的草稿', 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setVal = (key: string, val: string) => setData(p => ({ ...p, [key]: val }));

  const toggleTag = (key: string, tag: string) => {
    setSelectedTags(p => {
      const cur = p[key] || [];
      return { ...p, [key]: cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag] };
    });
  };

  const handleSubmit = async () => {
    if (!data.name) { toast('请填写昵称', 'error'); return; }

    const finalData = { ...data };
    Object.entries(selectedTags).forEach(([key, tags]) => {
      if (tags.length > 0) finalData[key] = tags.join(',');
    });

    const row: Row = {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
      user_id: userId ?? undefined,
      deposit: 0,
      createdAt: Date.now(),
      data: finalData as Row['data'],
    };

    if (userId && authToken) {
      try {
        const res = await fetch(`${API_BASE_URL}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(row),
        });
        if (res.ok) {
          afterSubmit(); // 已发布成功，草稿作废
          navigate('/profile');
        } else {
          toast('发布失败', 'error');
        }
      } catch (e) {
        toast('网络错误', 'error');
      }
    } else {
      addRow(loadRows(), row);
      afterSubmit(); // 已落库（本地兜底），草稿作废
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-main)' }}>
      <div className="max-w-lg mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/" className="p-2 rounded-lg hover-warm" style={{ color: 'var(--color-text-secondary)' }}>
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-lg font-medium" style={{ color: 'var(--color-text-primary)' }}>发布资料</h1>
        </div>

        {/* 草稿提示：联系方式/头像/生日等敏感与大体积字段不在白名单内，不会被存到本地 */}
        <div
          className="flex items-center justify-between gap-2 rounded-xl px-4 py-2.5 mb-5"
          style={{ background: 'var(--color-bg-card)', border: `1px solid ${restoredAt ? 'rgba(var(--color-success-rgb), 0.25)' : 'var(--color-border-light)'}` }}
        >
          <span className="text-xs" style={{ color: restoredAt ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
            {restoredAt
              ? `已恢复 ${formatDraftAge(restoredAt)}保存的未提交草稿`
              : '填写内容会自动存为本地草稿（敏感字段不保存）'}
          </span>
          {restoredAt && (
            <button
              onClick={() => { discard(); setData({}); setSelectedTags({}); toast('已放弃草稿', 'info'); }}
              className="shrink-0 text-xs px-2 py-1 rounded-lg"
              style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', background: 'var(--color-bg-input)' }}
            >
              放弃草稿
            </button>
          )}
        </div>

        {/* Avatar Upload */}
        <div className="mb-5">
          <label className="text-xs mb-2 block" style={{ color: 'var(--color-text-muted)' }}>头像照片</label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold avatar-gradient overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #F5B8A4, var(--color-primary))' }}>
              {normalizeAvatarUrl(data.avatar as string) ? (
                <img 
                  src={normalizeAvatarUrl(data.avatar as string) || ''} 
                  alt="头像预览" 
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <span style={{ color: 'white' }}>{String(data.name || '?')[0] || '?'}</span>
              )}
            </div>
            <div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (!file.type.startsWith('image/')) {
                      toast('请选择图片文件', 'error');
                      e.target.value = '';
                      return;
                    }
                    if (file.size > 3 * 1024 * 1024) {
                      toast('图片不能超过 3MB', 'error');
                      e.target.value = '';
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      setVal('avatar', ev.target?.result as string);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className="hidden"
                id="avatar-upload"
              />
              <label htmlFor="avatar-upload" className="inline-block px-4 py-2 rounded-xl text-sm cursor-pointer transition-all"
                style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-primary)' }}>
                上传照片
              </label>
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>支持 JPG、PNG 格式</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3">
          {columns.map(col => {
            if (col.type === 'tags') {
              return (
                <div key={col.key}>
                  <label className="text-xs mb-2 block" style={{ color: 'var(--color-text-muted)' }}>{col.label}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(col.options || []).map(opt => {
                      const isOn = (selectedTags[col.key] || []).includes(opt);
                      return (
                        <button key={opt} onClick={() => toggleTag(col.key, opt)}
                          className="px-3 py-1.5 rounded-lg text-xs transition-all"
                          style={{
                            background: isOn ? 'rgba(var(--color-primary-rgb), 0.08)' : '#FDF8F1',
                            border: `1px solid ${isOn ? '#F5B8A4' : 'var(--color-border-light)'}`,
                            color: isOn ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                          }}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (col.type === 'select') {
              return (
                <div key={col.key}>
                  <label className="text-xs mb-1.5 block" style={{ color: 'var(--color-text-muted)' }}>{col.label}</label>
                  <select className="w-full px-3 py-2.5 rounded-lg text-sm appearance-none"
                    style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', outline: 'none' }}
                    value={String(data[col.key] || '')} onChange={e => setVal(col.key, e.target.value)}>
                    <option value="" style={{ background: 'var(--color-bg-card)' }}>请选择</option>
                    {(col.options || []).map(o => <option key={o} value={o} style={{ background: 'var(--color-bg-card)' }}>{o}</option>)}
                  </select>
                </div>
              );
            }

            return (
              <div key={col.key}>
                <label className="text-xs mb-1.5 block" style={{ color: 'var(--color-text-muted)' }}>{col.label} {col.key === 'name' ? '*' : ''}</label>
                <input className="w-full px-3 py-2.5 rounded-lg text-sm transition-all"
                  style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', outline: 'none' }}
                  type="text"
                  placeholder={`输入${col.label}`}
                  value={String(data[col.key] || '')}
                  onFocus={e => (e.target.style.borderColor = '#F5B8A4')}
                  onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
                  onChange={e => setVal(col.key, e.target.value)} />
              </div>
            );
          })}
        </div>

        <button onClick={handleSubmit}
          className="w-full mt-5 mb-8 py-3.5 rounded-xl text-sm font-medium text-white transition-all"
          style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))', boxShadow: '0 2px 12px rgba(var(--color-primary-rgb), 0.2)' }}>
          发布
        </button>
      </div>
    </div>
  );
}
