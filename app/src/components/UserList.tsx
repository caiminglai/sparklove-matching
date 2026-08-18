import React from 'react';
import { Link } from 'react-router';
import {
  X, Plus, Check, Heart, Trash2,
  MapPin, User, Users, Shield, QrCode
} from 'lucide-react';
import { FIELD_LABELS } from '../data/constants';
import type { Column, Row } from '../data/types';
import { normalizeAvatarUrl } from '../api/config';

// 用户列表项（memo 优化，避免翻页/收藏时整列表重渲染）
interface UserListItemProps {
  row: Row;
  score: number;
  matches: string[];
  columns: Column[];
  hasSearched: boolean;
  showSelectMode: boolean;
  isSelected: boolean;
  isFavorite: boolean;
  swipeRowId: string | null;
  onToggleFavorite: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onShowDetail: (id: string) => void;
  onDelete: (id: string) => void;
  onPreviewImage: (url: string) => void;
  onSwipeStart: (id: string) => void;
  onSwipeEnd: () => void;
}

const UserListItem = React.memo(function UserListItem({
  row,
  score,
  matches,
  columns,
  hasSearched,
  showSelectMode,
  isSelected,
  isFavorite,
  swipeRowId,
  onToggleFavorite,
  onToggleSelect,
  onShowDetail,
  onDelete,
  onPreviewImage,
  onSwipeStart,
  onSwipeEnd,
}: UserListItemProps) {
  const visibleCols = columns.filter(c => {
    const val = row.data?.[c.key as keyof typeof row.data];
    return c.key !== 'name' && c.key !== 'contact' && c.key !== 'purpose' && val && String(val).trim();
  });

  return (
    <div
      className={`relative rounded-2xl cursor-pointer transition-all duration-300 hover:translate-y-[-2px] card-shadow hover:card-shadow-hover fade-in overflow-hidden ${isSelected ? 'ring-2 ring-orange-500' : ''}`}
      style={{
        background: score > 0 ? 'linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.03) 0%, rgba(255,255,255,0.98) 40%, rgba(255,255,255,0.98) 100%)' : 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${score > 0 ? 'rgba(var(--color-primary-rgb), 0.15)' : 'rgba(var(--color-border-warm-rgb), 0.5)' }`,
      }}
      onClick={() => {
        if (showSelectMode) {
          onToggleSelect(row.id);
        } else {
          onShowDetail(row.id);
        }
      }}
      onDoubleClick={() => {
        if (!showSelectMode) {
          onToggleFavorite(row.id);
        }
      }}
      onTouchStart={() => {
        if (!showSelectMode) {
          onSwipeStart(row.id);
        }
      }}
      onTouchEnd={onSwipeEnd}>

      <div className="absolute right-0 top-0 bottom-0 w-16 flex items-center justify-center" style={{ background: 'var(--color-danger)', transform: swipeRowId === row.id ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.3s ease' }}>
        <button onClick={(e) => { e.stopPropagation(); onDelete(row.id); }} className="text-white" title="删除">
          <Trash2 size={20} />
        </button>
      </div>

      <div className="p-5">
        <div className="flex items-center gap-4 mb-3">
          {showSelectMode && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => { e.stopPropagation(); onToggleSelect(row.id); }}
              className="w-5 h-5 rounded-lg accent-orange-500 flex-shrink-0"
            />
          )}
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold flex-shrink-0 avatar-gradient relative overflow-hidden cursor-pointer"
            style={{ width: '56px', height: '56px', borderRadius: '16px' }}
            onClick={(e) => {
              e.stopPropagation();
              if (row.data?.avatar) onPreviewImage(normalizeAvatarUrl(row.data.avatar) || '');
            }}>
            <span className="absolute inset-0 flex items-center justify-center">{String(row.data?.name || '?')[0]}</span>

            {row.data?.avatar && (
              <img
                src={normalizeAvatarUrl(row.data.avatar) || undefined}
                alt={row.data?.name}
                className="w-full h-full object-cover absolute inset-0"
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.onerror = null;
                  target.style.display = 'none';
                }}
              />
            )}

            {isFavorite && (
              <Heart size={12} className="absolute -bottom-1 -right-1" style={{ color: 'var(--color-primary)', fill: 'var(--color-primary)' }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>{row.data?.name || '匿名'}</span>
              {row.data?.purpose && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(var(--color-primary-rgb), 0.06)', color: 'var(--color-primary)', border: '1px solid rgba(var(--color-primary-rgb), 0.12)' }}>
                  {row.data.purpose}
                </span>
              )}
              {hasSearched && score > 0 && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: 'linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.1), rgba(var(--color-primary-rgb), 0.06))', color: 'var(--color-primary)', border: '1px solid rgba(var(--color-primary-rgb), 0.15)' }}>
                  {score}分
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              {row.data?.gender && <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{row.data.gender}</span>}
              {row.data?.age && <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{row.data.age}岁</span>}
              {row.data?.city && (
                <span className="inline-flex items-center gap-0.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  <MapPin size={9} />{row.data.city}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(row.id); }}
              className={`p-2 rounded-xl transition-colors hover-warm`}
              style={{ color: isFavorite ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
              title={isFavorite ? '取消收藏' : '收藏'}>
              <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(row.id); }}
              className="p-2 rounded-xl hover-warm transition-colors" style={{ color: 'var(--color-text-muted)' }} title="删除">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {visibleCols.slice(0, 6).map(col => {
            const val = String(row.data?.[col.key as keyof typeof row.data]);
            const isMatch = matches.some(m => m.startsWith(col.key + ':'));
            const display = val.length > 12 ? val.slice(0, 12) + '...' : val;
            return (
              <span key={col.key}
                className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${isMatch ? 'tag-match' : 'tag-bubble'}`}>
                {FIELD_LABELS[col.key] || col.label}: {display}
              </span>
            );
          })}
          {visibleCols.length > 6 && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium tag-bubble">
              +{visibleCols.length - 6}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

interface UserListProps {
  displayResults: Array<{ row: Row; score: number; matches: string[] }>;
  columns: Column[];
  hasSearched: boolean;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  selectedRows: string[];
  showSelectMode: boolean;
  onToggleSelect: (id: string) => void;
  onExitSelectMode: () => void;
  onDeleteSelected: () => void;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  loadingPage: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  swipeRowId?: string | null;
  onShowDetail: (id: string) => void;
  onDelete: (id: string) => void;
  onPreviewImage: (url: string) => void;
  onSwipeStart?: (id: string) => void;
  onSwipeEnd?: () => void;
  onAdd: () => void;
  onOpenFavorites: () => void;
  onOpenProfile: () => void;
  onEnterSelectMode: () => void;
  onShowAll: () => void;
  onToggleAddCol: () => void;
  resultsCount: number;
  selectedPurpose?: string;
}

export default function UserList({
  displayResults,
  columns,
  hasSearched,
  favorites,
  onToggleFavorite,
  selectedRows,
  showSelectMode,
  onToggleSelect,
  onExitSelectMode,
  onDeleteSelected,
  currentPage,
  totalPages,
  totalCount,
  loadingPage,
  onPrevPage,
  onNextPage,
  swipeRowId = null,
  onShowDetail,
  onDelete,
  onPreviewImage,
  onSwipeStart = () => {},
  onSwipeEnd = () => {},
  onAdd,
  onOpenFavorites,
  onOpenProfile,
  onEnterSelectMode,
  onShowAll,
  onToggleAddCol,
  resultsCount,
  selectedPurpose = '',
}: UserListProps) {
  return (
    <>
      {showSelectMode && (
        <div className="sticky top-0 z-40 px-4 -mx-4 py-3 flex items-center justify-between" style={{ background: 'rgba(var(--color-primary-rgb), 0.08)', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center gap-3">
            <button onClick={onExitSelectMode} className="flex items-center gap-1 text-sm" style={{ color: 'var(--color-primary)' }}>
              <X size={16} /> 取消
            </button>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>已选择 {selectedRows.length} 人</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onDeleteSelected} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--color-danger)' }}>
              <Trash2 size={14} /> 删除
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {hasSearched ? '匹配结果' : '所有人'}
          </h3>
          {selectedPurpose && <span className="text-xs px-2.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(var(--color-primary-rgb), 0.06)', color: 'var(--color-primary)', border: '1px solid rgba(var(--color-primary-rgb), 0.12)' }}>{selectedPurpose}</span>}
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(var(--color-text-dark-rgb), 0.04)', color: 'var(--color-text-secondary)' }}>{resultsCount}人</span>
          {favorites.length > 0 && (
            <button
              onClick={onOpenFavorites}
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(var(--color-primary-rgb), 0.06)', color: 'var(--color-primary)', border: '1px solid rgba(var(--color-primary-rgb), 0.12)' }}>
              收藏 ({favorites.length})
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={onOpenProfile} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl font-medium tag-bubble">
            <User size={11} /> 我的
          </button>
          {hasSearched && (
            <button onClick={onShowAll} className="text-xs font-medium px-2.5 py-1.5 rounded-xl tag-bubble">显示全部</button>
          )}
          <button onClick={onToggleAddCol} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl font-medium tag-bubble">
            <Plus size={11} /> 列
          </button>
          <button onClick={onEnterSelectMode} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl font-medium tag-bubble">
            <Check size={11} /> 选择
          </button>

          <Link to="/circles" className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl font-medium" style={{ background: 'rgba(var(--color-info-rgb), 0.06)', border: '1px solid rgba(var(--color-info-rgb), 0.12)', color: 'var(--color-info)' }}>
            <Users size={11} /> 圈子
          </Link>
          <Link to="/deposit" className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl font-medium" style={{ background: 'rgba(var(--color-success-rgb), 0.06)', border: '1px solid rgba(var(--color-success-rgb), 0.12)', color: 'var(--color-success)' }}>
            <Shield size={11} /> 保障
          </Link>
          <Link to="/qr" className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl font-medium" style={{ background: 'rgba(var(--color-primary-rgb), 0.06)', border: '1px solid rgba(var(--color-primary-rgb), 0.12)', color: 'var(--color-primary)' }}>
            <QrCode size={11} /> 分享
          </Link>
          <button onClick={onAdd} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl font-medium text-white btn-primary">
            <Plus size={11} /> 发布
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {displayResults.map(({ row, score, matches }) => (
          <UserListItem
            key={row.id}
            row={row}
            score={score}
            matches={matches}
            columns={columns}
            hasSearched={hasSearched}
            showSelectMode={showSelectMode}
            isSelected={selectedRows.includes(row.id)}
            isFavorite={favorites.includes(row.id)}
            swipeRowId={swipeRowId}
            onToggleFavorite={onToggleFavorite}
            onToggleSelect={onToggleSelect}
            onShowDetail={onShowDetail}
            onDelete={onDelete}
            onPreviewImage={onPreviewImage}
            onSwipeStart={onSwipeStart}
            onSwipeEnd={onSwipeEnd}
          />
        ))}
      </div>

      {resultsCount === 0 && (
        <div className="text-center py-16 fade-in">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(var(--color-primary-rgb), 0.06)' }}>
            <Heart size={28} style={{ color: 'var(--color-primary)', opacity: 0.4 }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>暂无匹配结果</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>试试调整筛选条件，或发布自己的资料</p>
          <button onClick={onAdd} className="inline-flex items-center gap-1.5 mt-4 text-sm px-5 py-2.5 rounded-xl text-white btn-primary font-medium">
            <Plus size={14} /> 发布资料
          </button>
        </div>
      )}

      <footer className="text-center py-10 mt-6" style={{ borderTop: '1px solid rgba(var(--color-border-warm-rgb), 0.4)' }}>
        {resultsCount > 0 && (
          <div className="mb-6">
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
              第 {currentPage} / {totalPages} 页，共 {totalCount} 人
            </p>
            <div className="inline-flex items-center gap-2">
              <button
                onClick={onPrevPage}
                disabled={currentPage <= 1 || loadingPage}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: (currentPage <= 1 || loadingPage) ? 'rgba(var(--color-border-warm-rgb), 0.4)' : 'rgba(var(--color-primary-rgb), 0.08)',
                  color: (currentPage <= 1 || loadingPage) ? 'var(--color-text-secondary)' : 'var(--color-primary)',
                  border: '1px solid rgba(var(--color-primary-rgb), 0.15)'
                }}
              >
                上一页
              </button>
              <span className="text-sm font-medium px-4" style={{ color: 'var(--color-text-primary)' }}>{currentPage}</span>
              <button
                onClick={onNextPage}
                disabled={currentPage >= totalPages || loadingPage}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: (currentPage >= totalPages || loadingPage) ? 'rgba(var(--color-border-warm-rgb), 0.4)' : 'rgba(var(--color-primary-rgb), 0.08)',
                  color: (currentPage >= totalPages || loadingPage) ? 'var(--color-text-secondary)' : 'var(--color-primary)',
                  border: '1px solid rgba(var(--color-primary-rgb), 0.15)'
                }}
              >
                下一页
              </button>
            </div>
            {loadingPage && (
              <div className="mt-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <span className="inline-flex items-center gap-2">
                  <span className="animate-spin rounded-full h-3 w-3 border-b-2" style={{ borderColor: 'var(--color-primary)' }}></span>
                  加载中...
                </span>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center justify-center gap-1.5">
            <Heart size={10} style={{ color: 'var(--color-primary)', opacity: 0.5 }} fill="currentColor" />
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>微光亦是永恒 — 让每一次相遇都精准</p>
          </div>
          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">浙ICP备2026048677号-1</a>
            <span className="mx-1.5">·</span>
            <a href="https://beian.mps.gov.cn/#/query/webSearch?code=33011002019955" target="_blank" rel="noopener noreferrer">浙公网安备33011002019955号</a>
          </div>
        </div>
      </footer>
    </>
  );
}
