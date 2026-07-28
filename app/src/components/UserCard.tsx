import { Heart, Trash2, Star, Flag, MapPin, Check } from 'lucide-react';
import type { Row } from '../data/types';
import { normalizeAvatarUrl } from '../api/config';

interface UserCardProps {
  row: Row;
  score: number;
  matches: string[];
  isFavorite: boolean;
  isSelected: boolean;
  showSelectMode: boolean;
  currentUserId: string | null;
  onToggleFavorite: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onShowDetail: (id: string) => void;
  onShowDelete: (id: string) => void;
  onShowRating: (id: string) => void;
  onShowReport: (id: string) => void;
}

export function maskContact(contact: string) {
  if (!contact) return '';
  if (/^\d{11}$/.test(contact)) {
    return contact.slice(0, 3) + '****' + contact.slice(7);
  }
  return contact.slice(0, 3) + '****' + contact.slice(-2);
}

export default function UserCard({
  row, score, matches, isFavorite, isSelected, showSelectMode, currentUserId,
  onToggleFavorite, onToggleSelect, onShowDetail, onShowDelete, onShowRating, onShowReport
}: UserCardProps) {
  const d = row.data || {};
  const isOwner = row.user_id && row.user_id === currentUserId;

  return (
    <div
      className={`rounded-2xl p-4 mb-3 transition-all duration-200 ${isSelected ? 'ring-2' : ''}`}
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255,253,249,0.98) 100%)',
        border: isSelected ? '2px solid var(--color-primary)' : '1px solid rgba(var(--color-primary-rgb), 0.08)',
        boxShadow: isSelected ? '0 4px 20px rgba(var(--color-primary-rgb), 0.15)' : '0 2px 12px rgba(var(--color-text-dark-rgb), 0.04)',
        borderColor: isSelected ? 'var(--color-primary)' : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        {/* 头像 */}
        <div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden">
          {normalizeAvatarUrl(d.avatar) ? (
            <img
              src={normalizeAvatarUrl(d.avatar) || ''}
              alt={d.name || '用户头像'}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.onerror = null;
                const bgColor = d.gender === '女' ? 'FFE4E1' : 'E0F7FA';
                const textColor = d.gender === '女' ? 'E87A5D' : '5B9BD5';
                const initial = (d.name || '?')[0];
                target.src = 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#${bgColor}"/><text x="24" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#${textColor}">${initial}</text></svg>`);
              }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white font-bold text-lg"
              style={{ background: d.gender === '女' ? 'linear-gradient(135deg, #FF9A9E, #FECFEF)' : 'linear-gradient(135deg, #89CFF0, #B8D4E3)' }}
            >
              {(d.name || '?')[0]}
            </div>
          )}
        </div>

        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{d.name || '未知'}</span>
            {d.gender && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: d.gender === '女' ? 'rgba(255,154,158,0.1)' : 'rgba(137,207,240,0.1)', color: d.gender === '女' ? 'var(--color-primary)' : '#5B9BD5' }}>{d.gender}</span>}
            {d.age && <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>{d.age}岁</span>}
            {d.city && <span className="inline-flex items-center gap-0.5 text-xs" style={{ color: 'var(--color-text-light)' }}><MapPin size={10} />{d.city}</span>}
            {score > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(var(--color-success-rgb), 0.1)', color: 'var(--color-success)' }}>匹配{score}项</span>}
          </div>
          <div className="flex flex-wrap gap-1 mb-1">
            {d.education && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(var(--color-info-rgb), 0.06)', color: 'var(--color-info)' }}>{d.education}</span>}
            {d.height && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(var(--color-primary-rgb), 0.06)', color: 'var(--color-primary)' }}>{d.height}cm</span>}
            {d.job && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(var(--color-text-dark-rgb), 0.04)', color: 'var(--color-text-muted)' }}>{d.job}</span>}
          </div>
          {matches.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {matches.map(m => <span key={m} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(var(--color-success-rgb), 0.08)', color: 'var(--color-success)' }}>✓ {m}</span>)}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-col items-center gap-1">
          {showSelectMode ? (
            <button onClick={() => onToggleSelect(row.id)} className="p-1.5 rounded-lg" style={{ color: isSelected ? 'var(--color-primary)' : '#D4C8B8' }}>
              <Check size={18} />
            </button>
          ) : (
            <>
              <button onClick={() => onToggleFavorite(row.id)} className="p-1.5 rounded-lg" style={{ color: isFavorite ? 'var(--color-primary)' : '#D4C8B8' }}>
                <Heart size={16} fill={isFavorite ? 'var(--color-primary)' : 'none'} />
              </button>
              <button onClick={() => onShowDetail(row.id)} className="p-1.5 rounded-lg text-xs" style={{ color: 'var(--color-text-light)' }}>详情</button>
            </>
          )}
        </div>
      </div>

      {/* 底部操作栏 */}
      {!showSelectMode && (
        <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid rgba(var(--color-primary-rgb), 0.06)' }}>
          <button onClick={() => onShowRating(row.id)} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--color-text-light)' }}><Star size={12} />评价</button>
          <button onClick={() => onShowReport(row.id)} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--color-text-light)' }}><Flag size={12} />举报</button>
          {(isOwner || !row.user_id) && (
            <button onClick={() => onShowDelete(row.id)} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg ml-auto" style={{ color: 'var(--color-primary)' }}><Trash2 size={12} />删除</button>
          )}
        </div>
      )}
    </div>
  );
}
