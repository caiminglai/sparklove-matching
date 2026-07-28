import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Shield, Heart, Users, Sparkles } from 'lucide-react';
import { loadRows, deleteRow, loadColumns, addColumn } from '../services/user.service';
import { fetchFieldMappings } from '../services/field-mapping.service';
import { matchRows } from '../services/match.service';
import type { Column, MatchCondition, Row, FlatRow, Rating } from '../data/types';
import { API_BASE_URL } from '../api/config';
import ImagePreview from '../components/ImagePreview';
import RatingModal from '../components/RatingModal';
import ReportModal from '../components/ReportModal';
import SearchPanel from '../components/SearchPanel';
import UserList from '../components/UserList';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import ContactPayModal from '../components/ContactPayModal';
import UserDetailModal from '../components/UserDetailModal';
import { handleApiError } from '../utils/errorHandler';
import { useToast } from '../components/Toast';

export default function Home() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [columns, setColumns] = useState<Column[]>(loadColumns);
  const [rows, setRows] = useState<Row[]>(() => loadRows());
  const [selectedPurpose, setSelectedPurpose] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // 从后端拉取字段中文映射表，动态更新列定义（API不可用时回退到本地默认值）
  useEffect(() => {
    fetchFieldMappings().then(apiColumns => {
      setColumns(prev => {
        // 保留用户自定义字段（category === 'custom'），标准字段用API返回的
        const customCols = prev.filter(c => c.category === 'custom');
        // 合并：API标准字段 + 用户自定义字段
        const merged = [...apiColumns, ...customCols];
        localStorage.setItem('match_columns', JSON.stringify(merged));
        return merged;
      });
    }).catch(() => {});
  }, []);

  // 分页相关状态（必须在 loadUsers 函数之前定义）
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50; // 每页50条
  const [totalPages, setTotalPages] = useState(1); // 总页数
  const [totalCount, setTotalCount] = useState(0); // 总人数
  const [loadingPage, setLoadingPage] = useState(false); // 是否正在翻页
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 搜索相关状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchExact, setSearchExact] = useState(false);
  const [activeSearchKeyword, setActiveSearchKeyword] = useState('');
  const [activeSearchExact, setActiveSearchExact] = useState(false);

  // 构造 API URL
  const buildApiUrl = (page: number, keyword: string, exact: boolean) => {
    let url = `${API_BASE_URL}/users?page=${page}&limit=${pageSize}`;
    if (keyword.trim()) {
      url += `&keyword=${encodeURIComponent(keyword.trim())}&exact=${exact ? 'true' : 'false'}`;
    }
    return url;
  };

  // 加载用户数据（支持分页 + 搜索）
  const loadUsers = async (page: number, keyword: string = activeSearchKeyword, exact: boolean = activeSearchExact) => {
    if (page === 1) {
      setLoading(true);
    } else {
      setLoadingPage(true);
    }
    setError(null);

    try {
      const authToken = localStorage.getItem('auth_token');
      const headers: Record<string, string> = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
      const [usersRes, cfRes] = await Promise.all([
        fetch(buildApiUrl(page, keyword, exact), { headers }),
        fetch(`${API_BASE_URL}/users/all-custom-fields`).catch(() => null),
      ]);
      const usersData = await usersRes.json();
      if (usersData.success && usersData.data) {
        let rows = usersData.data;

        // 合并自定义字段到行数据
        if (cfRes && cfRes.ok) {
          const cfData = await cfRes.json();
          if (cfData.success && Array.isArray(cfData.data)) {
            const cfMap: Record<string, Record<string, string>> = {};
            for (const cf of cfData.data) {
              if (!cfMap[cf.user_id]) cfMap[cf.user_id] = {};
              cfMap[cf.user_id][cf.field_key] = cf.field_value;
            }
            rows = rows.map((row: FlatRow) => {
              if (row.user_id && cfMap[row.user_id]) {
                return { ...row, data: { ...row.data, ...cfMap[row.user_id] } };
              }
              return row;
            });
          }
        }

        setRows(rows);
        setCurrentPage(page);
        setTotalCount(usersData.total || rows.length);
        setTotalPages(Math.max(1, Math.ceil((usersData.total || rows.length) / pageSize)));
      } else {
        setError('加载数据失败');
      }
    } catch (err) {
      handleApiError(err, '网络错误，请刷新页面重试');
      setError('网络错误，请刷新页面重试');
    } finally {
      setLoading(false);
      setLoadingPage(false);
    }
  };

  // [AGENT-DO-NOT-MODIFY] ============================================
  // 核心功能：搜索处理
  // 注意：此区域为核心功能，请勿随意改动
  // ===================================================================
  const handleSearch = () => {
    setHasSearched(false);
    setConditions([{ column: '', value: '' }]);
    setActiveSearchKeyword(searchKeyword);
    setActiveSearchExact(searchExact);
    loadUsers(1, searchKeyword, searchExact);
  };

  // 重置搜索
  const handleResetSearch = () => {
    setSearchKeyword('');
    setSearchExact(false);
    setHasSearched(false);
    setConditions([{ column: '', value: '' }]);
    setActiveSearchKeyword('');
    setActiveSearchExact(false);
    loadUsers(1, '', false);
  };

  // 上一页
  const goPrevPage = () => {
    if (currentPage > 1 && !loadingPage) {
      loadUsers(currentPage - 1, activeSearchKeyword, activeSearchExact);
    }
  };

  // 下一页
  const goNextPage = () => {
    if (currentPage < totalPages && !loadingPage) {
      loadUsers(currentPage + 1, activeSearchKeyword, activeSearchExact);
    }
  };

  // 初始加载
  useEffect(() => {
    const userId = localStorage.getItem('user_id');
    setCurrentUserId(userId);
    loadUsers(1, '', false);
  }, []);



  const [conditions, setConditions] = useState<MatchCondition[]>(() => {
    const saved = localStorage.getItem('match_conditions');
    return saved ? JSON.parse(saved) : [{ column: '', value: '' }];
  });
  const [hasSearched, setHasSearched] = useState(false);
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColKey, setNewColKey] = useState('');
  const [newColLabel, setNewColLabel] = useState('');
  const [showDelModal, setShowDelModal] = useState(false);
  const [selRowId, setSelRowId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('match_favorites');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [showSelectMode, setShowSelectMode] = useState(false);
  const [swipeRowId, setSwipeRowId] = useState<string | null>(null);
  const [debouncedConditions, setDebouncedConditions] = useState<MatchCondition[]>(conditions);
  const [showRatingModal, setShowRatingModal] = useState<string | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payContactTarget, setPayContactTarget] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [reportType, setReportType] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportProofImage, setReportProofImage] = useState<File | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [averageRating, setAverageRating] = useState<{ avg: number; count: number } | null>(null);
  const [contactUnlocked, setContactUnlocked] = useState(false);
  const [fullContact, setFullContact] = useState<string | null>(null); // 完整联系方式（解锁后从后端获取）

  // 搜索防抖：conditions变化后300ms才更新debouncedConditions
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedConditions(conditions);
    }, 300);
    return () => clearTimeout(timer);
  }, [conditions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [hasSearched, selectedPurpose]);

  useEffect(() => {
    localStorage.setItem('match_favorites', JSON.stringify(favorites));
  }, [favorites]);

  // 检查联系方式解锁状态
  useEffect(() => {
    if (showDetail && currentUserId) {
      setContactUnlocked(false);
      setFullContact(null);

      const isValidId = /^[a-zA-Z0-9_-]+$/.test(currentUserId) && /^[a-zA-Z0-9_-]+$/.test(showDetail);
      if (!isValidId) return;

      const authToken = localStorage.getItem('auth_token');
      if (!authToken) return;

      fetch(`${API_BASE_URL}/users/${encodeURIComponent(showDetail)}/check-unlock`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setContactUnlocked(data.unlocked);
            if (data.unlocked && data.contact) {
              setFullContact(data.contact);
            }
          }
        })
        .catch(() => { });
    } else {
      setContactUnlocked(false);
      setFullContact(null);
    }
  }, [showDetail, currentUserId]);

  // [AGENT-DO-NOT-MODIFY] ============================================
  // 核心功能：多条件筛选逻辑（关键词 + 目的）
  // 注意：此区域为核心功能，请勿随意改动
  // ===================================================================
  const filteredRows = useMemo(() => {
    let filtered = rows;

    // 关键词搜索（如果后端已处理，这里可以跳过，但保留以防万一）
    if (activeSearchKeyword.trim()) {
      const keyword = activeSearchKeyword.trim().toLowerCase();
      filtered = filtered.filter(r => {
        const text = Object.values(r.data || {}).join(' ').toLowerCase();
        if (activeSearchExact) {
          return text.split(/\s+/).some(word => word === keyword);
        }
        return text.includes(keyword);
      });
    }

    // 目的筛选
    if (selectedPurpose) {
      filtered = filtered.filter(r => r.data?.purpose === selectedPurpose);
    }

    return filtered;
  }, [rows, activeSearchKeyword, activeSearchExact, selectedPurpose]);

  // [AGENT-DO-NOT-MODIFY] ============================================
  // 核心功能：多条件匹配逻辑
  // 注意：此区域为核心功能，请勿随意改动
  // ===================================================================
  const results = useMemo(() =>
    hasSearched
      ? matchRows(filteredRows, debouncedConditions)
      : filteredRows.map(r => ({ row: r, score: 0, matches: [] as string[] }))
    , [hasSearched, filteredRows, debouncedConditions]);

  // 后端分页模式：直接使用 results 作为 displayResults（每页数据由后端返回）
  const displayResults = results;

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev =>
      prev.includes(id)
        ? prev.filter(fid => fid !== id)
        : [...prev, id]
    );
  }, []);

  const toggleSelect = useCallback((id: string) => {
    if (!showSelectMode) {
      setShowSelectMode(true);
    }
    setSelectedRows(prev =>
      prev.includes(id)
        ? prev.filter(sid => sid !== id)
        : [...prev, id]
    );
  }, [showSelectMode]);

  const exitSelectMode = useCallback(() => {
    setShowSelectMode(false);
    setSelectedRows([]);
  }, []);

  // 列表项事件处理器（stable 引用，配合 React.memo 避免整列表重渲染）
  const handleDeleteItem = useCallback((id: string) => {
    setSelRowId(id);
    setShowDelModal(true);
  }, []);

  const handlePreviewImage = useCallback((url: string) => {
    setPreviewImage(url);
  }, []);

  const handleShowPay = useCallback((id: string) => {
    setPayContactTarget(id);
    setShowPayModal(true);
  }, []);

  const handleSwipeStart = useCallback((id: string) => {
    setSwipeRowId(id);
  }, []);

  const handleSwipeEnd = useCallback(() => {
    setSwipeRowId(null);
  }, []);

  // 获取用户评价
  const loadRatings = useCallback(async (userId: string) => {
    // 验证用户ID格式
    if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/ratings`);
      if (res.ok) {
        const data = await res.json();
        setRatings(data.ratings || []);
        setAverageRating(data.average || { avg: 0, count: 0 });
      }
    } catch (e) {
      console.warn('loadRatings: 获取评价失败', e);
    }
  }, []);

  const handleShowDetail = useCallback((id: string) => {
    setShowDetail(id);
    loadRatings(id);
  }, [loadRatings]);

  // 提交评价
  const submitRating = useCallback(async (ratedId: string) => {
    // 验证ID格式
    if (!/^[a-zA-Z0-9_-]+$/.test(ratedId)) {
      toast('无效的用户ID', 'error');
      return;
    }

    const authToken = localStorage.getItem('auth_token');
    if (!authToken) {
      toast('请先登录', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          ratedId,
          rating: ratingValue,
          comment: ratingComment
        })
      });
      if (res.ok) {
        toast('评价成功！', 'success');
        setShowRatingModal(null);
        setRatingValue(5);
        setRatingComment('');
        loadRatings(ratedId);
      } else {
        const data = await res.json();
        toast(data.message || '评价失败', 'error');
      }
    } catch (e) {
      toast('网络错误', 'error');
    }
  }, [ratingValue, ratingComment, loadRatings]);

  // 提交举报
  const submitReport = useCallback(async (reportedId: string) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(reportedId)) {
      toast('无效的用户ID', 'error');
      return;
    }

    const authToken = localStorage.getItem('auth_token');
    if (!authToken) {
      toast('请先登录', 'error');
      return;
    }
    if (!reportType) {
      toast('请选择举报类型', 'error');
      return;
    }
    try {
      let res;
      if (reportProofImage) {
        const formData = new FormData();
        formData.append('reportedId', reportedId);
        formData.append('reportType', reportType);
        formData.append('description', reportDescription);
        formData.append('proof', reportProofImage);
        res = await fetch(`${API_BASE_URL}/reports`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`
          },
          body: formData
        });
      } else {
        res = await fetch(`${API_BASE_URL}/reports`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            reportedId,
            reportType,
            description: reportDescription
          })
        });
      }
      if (res.ok) {
        toast('举报成功！', 'success');
        setShowReportModal(null);
        setReportType('');
        setReportDescription('');
        setReportProofImage(null);
      } else {
        const data = await res.json();
        toast(data.message || '举报失败', 'error');
      }
    } catch (e) {
      toast('网络错误', 'error');
    }
  }, [reportType, reportDescription, reportProofImage]);

  const handleDeleteRow = async (id: string) => {
    // 验证ID格式
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      toast('无效的用户ID', 'error');
      setShowDelModal(false);
      return;
    }

    const authToken = localStorage.getItem('auth_token');
    const userId = localStorage.getItem('user_id');
    const row = rows.find(r => r.id === id);

    if (row?.user_id && userId && row.user_id !== userId) {
      toast('只能删除自己的数据', 'error');
      setShowDelModal(false);
      return;
    }

    if (authToken && row?.user_id) {
      try {
        const res = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` },
        });
        if (res.ok) {
          const next = rows.filter(r => r.id !== id);
          setRows(next);
        } else {
          const data = await res.json();
          toast(data.message || '删除失败', 'error');
        }
      } catch (e) {
        toast('网络错误', 'error');
      }
    } else {
      const next = deleteRow(id);
      setRows(next);
    }
    setShowDelModal(false);
    setSelRowId(null);
  };

  const deleteSelected = useCallback(() => {
    selectedRows.forEach(id => handleDeleteRow(id));
    exitSelectMode();
  }, [selectedRows, handleDeleteRow, exitSelectMode]);

  const handleAddCol = () => {
    if (!newColKey || !newColLabel) return;
    // 验证列键名格式，防止特殊字符
    if (!/^[a-zA-Z0-9_]+$/.test(newColKey)) {
      toast('列键名只能包含字母、数字和下划线', 'error');
      return;
    }
    const next = addColumn(columns, { key: newColKey, label: newColLabel, type: 'text' });
    setColumns(next);
    setNewColKey('');
    setNewColLabel('');
    setShowAddCol(false);
  };

  return (
    <div className="min-h-screen pb-16" style={{ background: 'linear-gradient(180deg, var(--color-bg-card) 0%, var(--color-bg-main) 30%)' }}>
      <div className="max-w-3xl mx-auto px-4 pt-8">

        <div className="relative text-center mb-8 pt-2">
          {/* Decorative circles */}
          <div className="absolute -top-4 -right-8 w-32 h-32 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, rgba(var(--color-primary-rgb), 0.3) 0%, transparent 70%)' }} />
          <div className="absolute top-8 -left-12 w-24 h-24 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, rgba(var(--color-success-rgb), 0.3) 0%, transparent 70%)' }} />

          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center avatar-gradient"
              style={{ animation: 'float 3s ease-in-out infinite' }}>
              <Heart size={22} color="white" fill="white" />
            </div>
            <h1 className="text-3xl font-bold tracking-wide" style={{ color: 'var(--color-text-primary)' }}>
              微光亦是永恒
            </h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
            精准匹配 · 缘分从数据开始
          </p>
          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(var(--color-primary-rgb), 0.06)', color: 'var(--color-primary)', border: '1px solid rgba(var(--color-primary-rgb), 0.12)' }}>
              <Sparkles size={10} /> 精准筛选
            </span>
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(var(--color-success-rgb), 0.06)', color: 'var(--color-success)', border: '1px solid rgba(var(--color-success-rgb), 0.12)' }}>
              <Shield size={10} /> 保证金保障
            </span>
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(var(--color-info-rgb), 0.06)', color: 'var(--color-info)', border: '1px solid rgba(var(--color-info-rgb), 0.12)' }}>
              <Users size={10} /> 圈子匹配
            </span>
          </div>
        </div>

        <SearchPanel
          columns={columns}
          onColumnsChange={setColumns}
          conditions={conditions}
          onConditionsChange={setConditions}
          hasSearched={hasSearched}
          onHasSearchedChange={setHasSearched}
          selectedPurpose={selectedPurpose}
          onSelectedPurposeChange={setSelectedPurpose}
          searchKeyword={searchKeyword}
          onSearchKeywordChange={setSearchKeyword}
          searchExact={searchExact}
          onSearchExactChange={setSearchExact}
          activeSearchKeyword={activeSearchKeyword}
          activeSearchExact={activeSearchExact}
          onSearch={handleSearch}
          onResetSearch={handleResetSearch}
          userCustomFieldKeys={(() => {
            const stdKeys = new Set(columns.map(c => c.key));
            const cfKeys = new Set<string>();
            for (const row of rows) {
              if (row.data) {
                for (const k of Object.keys(row.data)) {
                  if (!stdKeys.has(k)) cfKeys.add(k);
                }
              }
            }
            return Array.from(cfKeys);
          })()}
        />

        <p className="text-xs mb-6 px-1" style={{ color: '#D4C8B8' }}>
          提示：年龄支持范围写法如 "25-30"，也支持 {"'>25'"}、{"'<30'"} 等比较写法。多项选择可用逗号分隔。
        </p>

        {/* 加载状态 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mb-3"></div>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>加载中...</p>
          </div>
        )}

        {/* 错误提示 */}
        {error && !loading && (
          <div className="rounded-xl p-4 mb-4 text-center" style={{ background: 'rgba(var(--color-primary-rgb), 0.08)', border: '1px solid var(--color-bg-warm)' }}>
            <p className="text-sm mb-2" style={{ color: 'var(--color-primary)' }}>{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs px-4 py-1.5 rounded-lg text-white"
              style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' }}
            >
              刷新重试
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {showAddCol && (
              <div className="flex items-center gap-2 mb-3 p-3 rounded-xl" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-light)' }}>
                <input className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', width: '100px', outline: 'none' }} placeholder="字段名" value={newColKey} onChange={e => setNewColKey(e.target.value)} />
                <input className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', width: '100px', outline: 'none' }} placeholder="显示名" value={newColLabel} onChange={e => setNewColLabel(e.target.value)} />
                <button onClick={handleAddCol} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' }}>确定</button>
              </div>
            )}

            <UserList
              displayResults={displayResults}
              columns={columns}
              hasSearched={hasSearched}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              selectedRows={selectedRows}
              showSelectMode={showSelectMode}
              onToggleSelect={toggleSelect}
              onExitSelectMode={exitSelectMode}
              onDeleteSelected={deleteSelected}
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalCount}
              loadingPage={loadingPage}
              onPrevPage={goPrevPage}
              onNextPage={goNextPage}
              swipeRowId={swipeRowId}
              onShowDetail={handleShowDetail}
              onDelete={handleDeleteItem}
              onPreviewImage={handlePreviewImage}
              onSwipeStart={handleSwipeStart}
              onSwipeEnd={handleSwipeEnd}
              onAdd={() => navigate('/post')}
              onOpenFavorites={() => {
                setConditions([{ column: 'id', value: favorites.join(',') }]);
                setHasSearched(true);
              }}
              onOpenProfile={() => navigate(currentUserId ? '/profile' : '/login')}
              onEnterSelectMode={() => setShowSelectMode(true)}
              onShowAll={() => setHasSearched(false)}
              onToggleAddCol={() => setShowAddCol(!showAddCol)}
              resultsCount={results.length}
              selectedPurpose={selectedPurpose}
            />
          </>
        )}

        {showDetail && (
          <UserDetailModal
            userId={showDetail}
            row={rows.find(r => r.id === showDetail)}
            columns={columns}
            ratings={ratings}
            averageRating={averageRating}
            contactUnlocked={contactUnlocked}
            fullContact={fullContact}
            onClose={() => setShowDetail(null)}
            onPreviewImage={handlePreviewImage}
            onShowRating={setShowRatingModal}
            onShowReport={setShowReportModal}
            onShowPay={handleShowPay}
          />
        )}

        <DeleteConfirmModal
          isOpen={showDelModal}
          onClose={() => setShowDelModal(false)}
          onConfirm={() => selRowId && handleDeleteRow(selRowId)}
        />

        {showRatingModal && (
          <RatingModal
            onClose={() => setShowRatingModal(null)}
            ratingValue={ratingValue}
            setRatingValue={setRatingValue}
            ratingComment={ratingComment}
            setRatingComment={setRatingComment}
            onSubmit={() => submitRating(showRatingModal)}
          />
        )}

        {showReportModal && (
          <ReportModal
            onClose={() => setShowReportModal(null)}
            reportType={reportType}
            setReportType={setReportType}
            reportDescription={reportDescription}
            setReportDescription={setReportDescription}
            onSubmit={() => submitReport(showReportModal)}
            proofImage={reportProofImage}
            setProofImage={setReportProofImage}
          />
        )}

        {showPayModal && payContactTarget && (
          <ContactPayModal
            targetUserId={payContactTarget}
            onClose={() => setShowPayModal(false)}
          />
        )}

        <ImagePreview
          src={previewImage || ''}
          alt="图片预览"
          isOpen={!!previewImage}
          onClose={() => setPreviewImage(null)}
        />
      </div>
    </div>
  );
}
