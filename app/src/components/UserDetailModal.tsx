import { X, Star, Flag, MapPin, Shield } from 'lucide-react';
import { useNavigate } from 'react-router';
import { CATEGORIES, FIELD_LABELS } from '../data/constants';
import { normalizeAvatarUrl } from '../api/config';
import { maskContact } from '../utils/mask';
import type { Row, Column, Rating } from '../data/types';

interface UserDetailModalProps {
  userId: string;
  row: Row | undefined;
  columns: Column[];
  ratings: Rating[];
  averageRating: { avg: number; count: number } | null;
  contactUnlocked: boolean;
  fullContact: string | null;
  onClose: () => void;
  onPreviewImage: (url: string) => void;
  onShowRating: (id: string) => void;
  onShowReport: (id: string) => void;
  onShowPay: (targetId: string) => void;
}

export default function UserDetailModal({
  userId,
  row,
  columns,
  ratings,
  averageRating,
  contactUnlocked,
  fullContact,
  onClose,
  onPreviewImage,
  onShowRating,
  onShowReport,
  onShowPay
}: UserDetailModalProps) {
  const detailData = row?.data;
  const navigate = useNavigate();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end fade-in"
      style={{ background: 'rgba(var(--color-text-dark-rgb), 0.25)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full overflow-y-auto slide-in-right"
        style={{ background: 'linear-gradient(180deg, var(--color-bg-card) 0%, var(--color-bg-main) 100%)', boxShadow: '-8px 0 40px rgba(var(--color-text-dark-rgb), 0.1)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div className="sticky top-0 z-10 px-5 py-4" style={{ background: 'rgba(255,253,249,0.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(var(--color-border-warm-rgb), 0.4)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>详细资料</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover-warm transition-colors" style={{ color: 'var(--color-text-secondary)', background: 'rgba(var(--color-border-warm-rgb), 0.2)' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5">
          {detailData && (
            <div className="space-y-5">
              {/* Profile hero */}
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold avatar-gradient overflow-hidden cursor-pointer"
                  onClick={() => {
                    if (detailData.avatar) onPreviewImage(normalizeAvatarUrl(detailData.avatar) || '');
                  }}
                >
                  {detailData.avatar ? (
                    <img
                      src={normalizeAvatarUrl(detailData.avatar) || undefined}
                      alt={detailData.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.onerror = null;
                        target.style.display = 'none';
                      }}
                    />
                  ) : (
                    String(detailData.name || '?')[0]
                  )}
                </div>
                <div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{detailData.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {detailData.gender && <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{detailData.gender}</span>}
                    {detailData.age && <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{detailData.age}岁</span>}
                    {detailData.city && <span className="inline-flex items-center gap-0.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}><MapPin size={9} />{detailData.city}</span>}
                  </div>
                  {detailData.purpose && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full mt-1.5 inline-block font-medium" style={{ background: 'rgba(var(--color-primary-rgb), 0.06)', color: 'var(--color-primary)', border: '1px solid rgba(var(--color-primary-rgb), 0.12)' }}>
                      {detailData.purpose}
                    </span>
                  )}
                </div>
              </div>

              {CATEGORIES.map(cat => {
                const catCols = columns.filter(c => c.category === cat.key && c.key !== 'contact' && c.key !== 'purpose');
                const hasData = catCols.some(col => {
                  const val = detailData[col.key as keyof typeof detailData];
                  return val && String(val).trim();
                });
                if (!hasData) return null;
                return (
                  <div key={cat.key} className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(var(--color-border-warm-rgb), 0.4)' }}>
                    <div className="text-xs font-semibold mb-2.5 flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                      <span className="w-1 h-3 rounded-full" style={{ background: 'var(--color-primary)' }} />
                      {cat.label}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {catCols.map(col => {
                        const val = detailData[col.key as keyof typeof detailData];
                        if (!val || !String(val).trim()) return null;
                        return (
                          <span key={col.key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium tag-bubble">
                            {FIELD_LABELS[col.key] || col.label}: {String(val)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {detailData.contact && (
                <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.06), rgba(var(--color-primary-rgb), 0.02))', border: '1px solid rgba(var(--color-primary-rgb), 0.12)' }}>
                  <div className="text-xs font-semibold mb-1" style={{ color: 'var(--color-primary)' }}>联系方式</div>
                  {contactUnlocked ? (
                    <>
                      <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{fullContact || detailData.contact}</div>
                      <div className="mt-2 text-xs" style={{ color: 'var(--color-success)' }}>✓ 已解锁，可查看完整联系方式</div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{maskContact(detailData.contact)}</div>
                      <button
                        onClick={() => onShowPay(userId)}
                        className="mt-2 w-full py-2 rounded-lg text-xs font-medium"
                        style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-star))', color: '#fff' }}
                      >
                        💰 支付 9.9 元查看完整联系方式
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* 用户评价 */}
              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(var(--color-border-warm-rgb), 0.4)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                    <Star size={12} fill={averageRating && averageRating.count > 0 ? 'var(--color-star)' : 'none'} style={{ color: averageRating && averageRating.count > 0 ? 'var(--color-star)' : 'var(--color-text-secondary)' }} />
                    用户评价
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onShowRating(userId); }}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{ background: 'rgba(var(--color-success-rgb), 0.1)', color: 'var(--color-success)' }}
                  >
                    写评价
                  </button>
                </div>
                {averageRating && averageRating.count > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{averageRating.avg.toFixed(1)}</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(i => (
                          <Star key={i} size={14} fill={i <= Math.round(averageRating.avg) ? 'var(--color-star)' : 'none'} style={{ color: 'var(--color-star)' }} />
                        ))}
                      </div>
                      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>({averageRating.count}条评价)</span>
                    </div>
                    <div className="space-y-2">
                      {ratings.slice(0, 5).map((rating, index) => (
                        <div key={index} className="p-2 rounded-lg" style={{ background: 'rgba(var(--color-border-warm-rgb), 0.3)' }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{rating.rater_name || '匿名用户'}</span>
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map(i => (
                                <Star key={i} size={10} fill={i <= rating.rating ? 'var(--color-star)' : 'none'} style={{ color: 'var(--color-star)' }} />
                              ))}
                            </div>
                          </div>
                          {rating.comment && (
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{rating.comment}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-secondary)' }}>暂无评价，来写第一条评价吧！</p>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={(e) => { e.stopPropagation(); onShowRating(userId); }}
                  className="flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
                  style={{ background: 'rgba(var(--color-success-rgb), 0.1)', color: 'var(--color-success)', border: '1px solid rgba(var(--color-success-rgb), 0.2)' }}
                >
                  <Star size={14} />
                  评价
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate('/anti-fraud'); }}
                  className="flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, rgba(var(--color-success-rgb), 0.1), rgba(var(--color-success-rgb), 0.05))', color: 'var(--color-success)', border: '1px solid rgba(var(--color-success-rgb), 0.2)' }}
                >
                  <Shield size={14} />
                  防诈核实
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onShowReport(userId); }}
                  className="flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
                  style={{ background: 'rgba(var(--color-danger-rgb), 0.1)', color: 'var(--color-danger)', border: '1px solid rgba(var(--color-danger-rgb), 0.2)' }}
                >
                  <Flag size={14} />
                  举报
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
