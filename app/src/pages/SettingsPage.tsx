
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Lock, Eye, EyeOff, Shield, Info, ChevronRight, Moon, HelpCircle, MessageCircle } from 'lucide-react';
import { API_BASE_URL } from '../api/config';
import { getAuthToken } from '../utils/auth';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [changing, setChanging] = useState(false);
  const [message, setMessage] = useState('');

  const userId = localStorage.getItem('user_id');
  const authToken = getAuthToken();

  const handleChangePassword = async () => {
    setMessage('');
    if (!oldPassword || !newPassword || !confirmPassword) {
      setMessage('请填写所有字段');
      return;
    }
    if (newPassword.length < 6) {
      setMessage('新密码至少6位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('两次密码不一致');
      return;
    }

    setChanging(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('密码修改成功');
        setTimeout(() => {
          setShowPasswordModal(false);
          setOldPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setMessage('');
        }, 1500);
      } else {
        setMessage(data.message || '修改失败');
      }
    } catch (e) {
      setMessage('网络错误');
    } finally {
      setChanging(false);
    }
  };

  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-main)' }}>
        <div className="text-center">
          <p className="mb-4" style={{ color: 'var(--color-text-muted)' }}>请先登录</p>
          <Link to="/login" className="px-6 py-2 rounded-lg text-white text-sm" style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' }}>
            登录
          </Link>
        </div>
      </div>
    );
  }

  const settingGroups = [
    {
      title: '账号安全',
      items: [
        {
          icon: Lock,
          label: '修改密码',
          desc: '定期修改密码更安全',
          color: 'var(--color-primary)',
          bgColor: 'rgba(var(--color-primary-rgb), 0.08)',
          action: () => setShowPasswordModal(true),
        },
        {
          icon: Shield,
          label: '保证金管理',
          desc: '查看保证金状态',
          color: 'var(--color-success)',
          bgColor: 'rgba(var(--color-success-rgb), 0.08)',
          action: () => navigate('/deposit'),
        },
      ],
    },
    {
      title: '偏好设置',
      items: [
        {
          icon: Moon,
          label: '深色模式',
          desc: '即将推出',
          color: 'var(--color-info)',
          bgColor: 'rgba(var(--color-info-rgb), 0.08)',
          action: () => {},
        },
      ],
    },
    {
      title: '其他',
      items: [
        {
          icon: HelpCircle,
          label: '使用帮助',
          desc: '功能说明与常见问题',
          color: 'var(--color-info)',
          bgColor: 'rgba(196,123,175,0.08)',
          action: () => {},
          disabled: true,
        },
        {
          icon: MessageCircle,
          label: '意见反馈',
          desc: '帮助我们做得更好',
          color: 'var(--color-success)',
          bgColor: 'rgba(var(--color-success-rgb), 0.08)',
          action: () => {},
        },
        {
          icon: Info,
          label: '关于我们',
          desc: 'v1.0.0',
          color: 'var(--color-text-muted)',
          bgColor: 'rgba(139,123,107,0.08)',
          action: () => {},
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen pb-8" style={{ background: 'var(--color-bg-main)' }}>
      <div className="max-w-lg mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/profile" className="p-2 rounded-lg hover:bg-orange-50" style={{ color: 'var(--color-text-secondary)' }}>
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-lg font-medium" style={{ color: 'var(--color-text-primary)' }}>设置</h1>
        </div>

        <div className="space-y-5">
          {settingGroups.map(group => (
            <div key={group.title}>
              <h3 className="text-xs font-medium mb-2 px-1" style={{ color: 'var(--color-text-secondary)' }}>{group.title}</h3>
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-light)' }}>
                {group.items.map((item, idx) => {
                  const Icon = item.icon;
                  const content = (
                    <>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: item.bgColor }}>
                        <Icon size={14} style={{ color: item.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{item.label}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{item.desc}</div>
                      </div>
                      {!item.disabled && <ChevronRight size={14} style={{ color: '#D4C8B8' }} />}
                    </>
                  );
                  if (item.disabled) {
                    return (
                      <div
                        key={item.label}
                        className="w-full flex items-center gap-3 p-4 text-left"
                        style={idx < group.items.length - 1 ? { borderBottom: '1px solid var(--color-border-light)' } : {}}
                      >
                        {content}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-orange-50/30"
                      style={idx < group.items.length - 1 ? { borderBottom: '1px solid var(--color-border-light)' } : {}}
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 修改密码弹窗 */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(var(--color-text-dark-rgb), 0.3)' }}>
          <div className="rounded-2xl p-5 w-full max-w-sm" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-light)', boxShadow: '0 8px 32px rgba(var(--color-text-dark-rgb), 0.12)' }}>
            <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-text-primary)' }}>修改密码</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-muted)' }}>当前密码</label>
                <div className="relative">
                  <input
                    type={showOldPwd ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm pr-10"
                    style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', outline: 'none' }}
                    placeholder="输入当前密码"
                  />
                  <button onClick={() => setShowOldPwd(!showOldPwd)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-secondary)' }}>
                    {showOldPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-muted)' }}>新密码</label>
                <div className="relative">
                  <input
                    type={showNewPwd ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm pr-10"
                    style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', outline: 'none' }}
                    placeholder="输入新密码（至少6位）"
                  />
                  <button onClick={() => setShowNewPwd(!showNewPwd)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-secondary)' }}>
                    {showNewPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-muted)' }}>确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm"
                  style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', outline: 'none' }}
                  placeholder="再次输入新密码"
                />
              </div>
            </div>

            {message && (
              <p className="text-xs mt-3 text-center" style={{ color: message.includes('成功') ? 'var(--color-success)' : 'var(--color-primary)' }}>
                {message}
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleChangePassword}
                disabled={changing}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white"
                style={{ background: changing ? '#D4C8B8' : 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' }}
              >
                {changing ? '修改中...' : '确认修改'}
              </button>
              <button
                onClick={() => { setShowPasswordModal(false); setMessage(''); }}
                className="flex-1 py-2.5 rounded-lg text-sm"
                style={{ background: 'var(--color-bg-input)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
