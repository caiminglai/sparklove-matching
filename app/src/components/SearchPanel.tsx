import {
  Check,
  ChevronDown,
  Heart,
  MapPin,
  Plus,
  Search,
  Sparkles, Target,
  Trash2,
  User,
  Users,
  Users2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '../api/config';
import { CATEGORIES, PURPOSE_OPTIONS } from '../data/constants';
import type { AdminCustomField, Column, MatchCondition } from '../data/types';
import { waitForBootstrapSafeWindow, withInFlightDedup } from '../utils/bootstrap-guard';

const QUICK_TAGS = [
  { label: '女', key: 'gender', value: '女' },
  { label: '男', key: 'gender', value: '男' },
  { label: '西安', key: 'city', value: '西安' },
  { label: '北京', key: 'city', value: '北京' },
  { label: '上海', key: 'city', value: '上海' },
  { label: '杭州', key: 'city', value: '杭州' },
  { label: '深圳', key: 'city', value: '深圳' },
  { label: '成都', key: 'city', value: '成都' },
  { label: '火锅', key: 'food', value: '火锅' },
  { label: '烧烤', key: 'food', value: '烧烤' },
  { label: '日料', key: 'food', value: '日料' },
  { label: '动漫', key: 'hobbies', value: '动漫' },
  { label: '游戏', key: 'hobbies', value: '游戏' },
  { label: '摄影', key: 'hobbies', value: '摄影' },
  { label: '旅行', key: 'hobbies', value: '旅行' },
  { label: '跑步', key: 'sport', value: '跑步' },
  { label: '游泳', key: 'sport', value: '游泳' },
  { label: '篮球', key: 'sport', value: '篮球' },
  { label: '健身', key: 'sport', value: '健身' },
  { label: '音乐', key: 'music', value: '音乐' },
  { label: '民谣', key: 'music', value: '民谣' },
  { label: '流行', key: 'music', value: '流行' },
];

/**
 * 将后端返回的 options 元素（可能是 {label, value} 对象、数字、null）统一规范化为 string。
 * 修复：直接把对象作为 React children 渲染会触发 Minified React error #185。
 */
function normalizeOption(opt: unknown): string {
  if (opt === null || opt === undefined || typeof opt === 'boolean') return '';
  if (typeof opt === 'string') return opt;
  if (typeof opt === 'number' || typeof opt === 'bigint') return String(opt);
  if (typeof opt === 'object') {
    const o = opt as Record<string, unknown>;
    // 常见后端 options 对象格式：{label, value} / {name, key} / {text}
    const v = o.label ?? o.value ?? o.name ?? o.key ?? o.text ?? o.title;
    if (v !== undefined && v !== null) return String(v);
    // 兜底：不要直接返回对象（会炸 #185），返回空串，React 渲染时就忽略
    return '';
  }
  return String(opt);
}

/**
 * 将可能是对象数组 / 非字符串元素的 options 数组，规范化为纯 string[]，
 * 并过滤掉空串项，避免空 button 出现。
 */
function normalizeOptions(opts: unknown): string[] {
  if (!opts) return [];
  if (!Array.isArray(opts)) {
    const s = normalizeOption(opts);
    return s ? [s] : [];
  }
  const result: string[] = [];
  for (const raw of opts) {
    const s = normalizeOption(raw);
    if (s) result.push(s);
  }
  return result;
}

/**
 * 规范化字段 label（后端如果返回对象也能转字符串，避免炸 #185）。
 */
function normalizeLabel(label: unknown): string {
  if (label === null || label === undefined) return '';
  if (typeof label === 'string') return label;
  if (typeof label === 'number' || typeof label === 'bigint') return String(label);
  if (typeof label === 'object') {
    const o = label as Record<string, unknown>;
    const v = o.label ?? o.name ?? o.title ?? o.text ?? o.value;
    if (v !== undefined && v !== null) return String(v);
    return '';
  }
  return String(label);
}

const PURPOSE_ICONS: Record<string, typeof Users> = {
  '相亲交友': Heart,
  '拓展圈子': Users,
  '兴趣交流': Sparkles,
  '运动伙伴': Target,
  '学习搭子': Users2,
  '同城活动': Users,
  '寻找知己': Sparkles,
  '人生伴侣': Heart,
  '恋爱结婚': Heart,
  '先交朋友': Users,
  '找个伴': Users,
  '同城约会': Heart,
  '周末玩伴': Users,
  '一起旅行': MapPin,
  '一起运动': Target,
  '一起学习': Users2,
  '一起吃饭': User,
  '一起看电影': User,
  '一起打游戏': User,
  '一起健身': Target,
};

interface SearchPanelProps {
  columns: Column[];
  onColumnsChange: (cols: Column[]) => void;
  conditions: MatchCondition[];
  onConditionsChange: (conds: MatchCondition[]) => void;
  hasSearched: boolean;
  onHasSearchedChange: (v: boolean) => void;
  selectedPurpose: string;
  onSelectedPurposeChange: (v: string) => void;
  searchKeyword: string;
  onSearchKeywordChange: (v: string) => void;
  searchExact: boolean;
  onSearchExactChange: (v: boolean) => void;
  activeSearchKeyword: string;
  activeSearchExact: boolean;
  onSearch: () => void;
  onResetSearch: () => void;
  userCustomFieldKeys?: string[];
}

export default function SearchPanel({
  columns,
  onColumnsChange,
  conditions,
  onConditionsChange,
  onHasSearchedChange,
  selectedPurpose,
  onSelectedPurposeChange,
  searchKeyword,
  onSearchKeywordChange,
  searchExact,
  onSearchExactChange,
  activeSearchKeyword,
  activeSearchExact,
  onSearch,
  onResetSearch,
}: SearchPanelProps) {
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customFieldKey, setCustomFieldKey] = useState('');
  const [customFieldValue, setCustomFieldValue] = useState('');
  const [adminCustomFields, setAdminCustomFields] = useState<AdminCustomField[]>([]);
  const [showFieldDrop, setShowFieldDrop] = useState<number | null>(null);
  const [showValueDrop, setShowValueDrop] = useState<number | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // 从 columns 动态构建字段标签映射表（替代硬编码 labelMap）
  const labelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const col of columns) {
      map[col.key] = normalizeLabel(col.label);
    }
    return map;
  }, [columns]);

  // 从后端加载管理员定义的常用自定义字段（首屏延迟 + in-flight 去重，避免与 Vite SSE 重置窗口冲突）
  useEffect(() => {
    withInFlightDedup('admin:custom-fields', async () => {
      await waitForBootstrapSafeWindow();
      const res = await fetch(API_BASE_URL + '/custom-fields');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setAdminCustomFields(data.data);
      }
      return data;
    }).catch(() => { console.warn('加载管理员自定义字段失败'); });
  }, []);

  // conditions 持久化到 localStorage
  useEffect(() => {
    localStorage.setItem('match_conditions', JSON.stringify(conditions));
  }, [conditions]);

  // 下拉外部点击关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowFieldDrop(null);
        setShowValueDrop(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const findColumnInfo = useCallback((columnKey: string): (Column & { options: string[] }) | null => {
    const col = columns.find(c => c.key === columnKey);
    const safeColOpts = normalizeOptions(col?.options);
    if (col && safeColOpts.length > 0) {
      return { ...col, label: normalizeLabel(col.label), options: safeColOpts, category: col.category || '其他' };
    }
    const adminField = adminCustomFields.find((f: AdminCustomField) =>
      f.field_key === columnKey || f.field_label === columnKey);
    if (adminField) {
      const opts = normalizeOptions(adminField.options);
      const label = normalizeLabel(adminField.field_label);
      return {
        key: adminField.field_key,
        label,
        type: opts.length > 0 ? 'tags' : 'text',
        options: opts,
        category: 'custom'
      };
    }
    if (col) {
      return { ...col, label: normalizeLabel(col.label), options: safeColOpts, category: col.category || '其他' };
    }
    return null;
  }, [columns, adminCustomFields]);

  const addCond = useCallback(() => onConditionsChange([...conditions, { column: '', value: '' }]), [conditions, onConditionsChange]);
  const removeCond = useCallback((i: number) => onConditionsChange(conditions.filter((_, idx) => idx !== i)), [conditions, onConditionsChange]);
  const updateCond = useCallback((i: number, f: 'column' | 'value', v: string) =>
    onConditionsChange(conditions.map((c, idx) => idx === i ? { ...c, [f]: v } : c)), [conditions, onConditionsChange]);

  const clearAll = useCallback(() => {
    onConditionsChange([{ column: '', value: '' }]);
    onHasSearchedChange(false);
    localStorage.removeItem('match_conditions');
  }, [onConditionsChange, onHasSearchedChange]);

  const quickFilter = (col: string, val: string) => {
    if (!/^[a-zA-Z0-9_]+$/.test(col)) {
      return;
    }
    onConditionsChange([{ column: col, value: val }]);
    onHasSearchedChange(true);
  };

  const handleAddCustomFilter = () => {
    if (!customFieldKey.trim()) return;
    const rawKey = customFieldKey.trim();
    const cleanKey = rawKey.toLowerCase().replace(/[^a-z0-9_]/g, '') || rawKey;
    const adminField = adminCustomFields.find((f: AdminCustomField) =>
      f.field_label === rawKey || f.field_key === rawKey || f.field_key === cleanKey);
    let finalKey: string;
    let finalLabel: string;
    let finalType: 'text' | 'select' | 'tags' = 'text';
    let finalOptions: string[] = [];

    if (adminField) {
      finalKey = adminField.field_key;
      finalLabel = normalizeLabel(adminField.field_label);
      const opts = normalizeOptions(adminField.options);
      finalType = opts.length > 0 ? 'tags' : 'text';
      finalOptions = opts;
    } else {
      finalKey = cleanKey;
      finalLabel = rawKey;
      finalType = 'text';
    }

    onConditionsChange([...conditions, { column: finalKey, value: customFieldValue.trim() }]);
    const colExists = columns.some((c: Column) => c.key === finalKey);
    if (!colExists) {
      onColumnsChange([...columns, {
        key: finalKey,
        label: finalLabel,
        type: finalType,
        options: finalOptions,
        category: 'custom'
      }]);
    }
    setCustomFieldKey('');
    setCustomFieldValue('');
    setShowCustomFilter(false);
  };

  const addAdminCustomField = (field: AdminCustomField) => {
    const opts = normalizeOptions(field.options);
    const label = normalizeLabel(field.field_label);
    const colExists = columns.some((c: Column) => c.key === field.field_key);
    if (!colExists) {
      onColumnsChange([...columns, {
        key: field.field_key,
        label,
        type: opts.length > 0 ? 'tags' : 'text',
        options: opts,
        category: 'custom'
      }]);
    }
    onConditionsChange([...conditions, { column: field.field_key, value: '' }]);
    setShowCustomFilter(false);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <button
          onClick={() => onSelectedPurposeChange('')}
          className={`flex-shrink-0 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${!selectedPurpose
            ? 'btn-primary text-white'
            : 'tag-bubble'
            }`}
        >
          全部
        </button>
        {PURPOSE_OPTIONS.map(purpose => {
          const Icon = PURPOSE_ICONS[purpose] || Users;
          return (
            <button
              key={purpose}
              onClick={() => onSelectedPurposeChange(purpose)}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${selectedPurpose === purpose
                ? 'btn-primary text-white'
                : 'tag-bubble'
                }`}
            >
              <Icon size={13} />
              {purpose}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl p-5 mb-5 card-shadow" style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,253,249,0.95) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(var(--color-border-warm-rgb), 0.6)',
      }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(var(--color-primary-rgb), 0.1)' }}>
              <Search size={12} style={{ color: 'var(--color-primary)' }} />
            </div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>筛选条件</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg" style={{ background: 'rgba(var(--color-accent-purple-rgb), 0.08)', color: 'var(--color-accent-purple)', border: '1px solid rgba(var(--color-accent-purple-rgb), 0.2)' }}>
              <Sparkles size={11} /> 向量搜索
            </span>
            <button onClick={addCond} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg" style={{ color: 'var(--color-primary)', border: '1px solid var(--color-bg-warm)' }}>
              <Plus size={12} /> 添加条件
            </button>
            <button onClick={() => { setShowCustomFilter(!showCustomFilter); }}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg" style={{ color: 'var(--color-success)', border: '1px solid #D6E8DA' }}>
              <Plus size={12} /> 自定义字段
            </button>
            <button onClick={clearAll} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              <Trash2 size={12} /> 清空
            </button>
          </div>
        </div>

        {/* [AGENT-DO-NOT-MODIFY] ============================================
             核心功能：搜索（按昵称/姓名/ID）
             注意：此区域为核心功能，请勿随意改动
             =================================================================== */}
        <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(var(--color-info-rgb), 0.06)', border: '1px solid rgba(var(--color-info-rgb), 0.15)' }}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              type="text"
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', outline: 'none' }}
              placeholder="搜索（按昵称/姓名/ID）"
              value={searchKeyword}
              onChange={(e) => onSearchKeywordChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--color-text-primary)' }}>
                <input
                  type="checkbox"
                  checked={searchExact}
                  onChange={(e) => onSearchExactChange(e.target.checked)}
                  className="w-4 h-4 accent-orange-500"
                />
                精确匹配
              </label>
              <button
                onClick={onSearch}
                className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg text-white font-medium"
                style={{ background: 'linear-gradient(135deg, var(--color-info), #5A6DC8)' }}
              >
                <Search size={12} /> 搜索
              </button>
              <button
                onClick={onResetSearch}
                className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg font-medium"
                style={{ background: 'rgba(var(--color-text-dark-rgb), 0.06)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
              >
                <X size={12} /> 重置
              </button>
            </div>
          </div>
          {activeSearchKeyword && (
            <div className="mt-2 text-xs" style={{ color: 'var(--color-info)' }}>
              当前搜索：「{activeSearchKeyword}」{activeSearchExact ? '（精确匹配）' : '（模糊匹配）'}
            </div>
          )}
        </div>

        {showCustomFilter && (
          <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(var(--color-success-rgb), 0.05)', border: '1px solid rgba(var(--color-success-rgb), 0.15)' }}>
            <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-success)' }}>自定义筛选条件</div>
            {adminCustomFields.length > 0 && (
              <div className="mb-3">
                <div className="text-xs mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>管理员推荐字段：</div>
                <div className="flex flex-wrap gap-1.5">
                  {adminCustomFields.map((f: AdminCustomField) => (
                    <button key={f.id} onClick={() => addAdminCustomField(f)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{ background: 'rgba(var(--color-success-rgb), 0.08)', color: 'var(--color-success)', border: '1px solid rgba(var(--color-success-rgb), 0.15)' }}>
                      {f.field_label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input className="px-3 py-1.5 rounded-lg text-xs flex-1" style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', outline: 'none' }} placeholder="字段名（如：星座、宠物、信仰）"
                value={customFieldKey} onChange={e => setCustomFieldKey(e.target.value)} />
              <input className="px-3 py-1.5 rounded-lg text-xs flex-1" style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', outline: 'none' }} placeholder="筛选值（可留空）"
                value={customFieldValue} onChange={e => setCustomFieldValue(e.target.value)} />
              <button onClick={handleAddCustomFilter} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: 'linear-gradient(135deg, var(--color-success), #4D945F)' }}>添加</button>
            </div>
          </div>
        )}

        {/* [AGENT-DO-NOT-MODIFY] ============================================
             核心功能：多条件筛选（字段 + 值）
             注意：此区域为核心功能，请勿随意改动
             =================================================================== */}
        <div className="space-y-2.5" ref={dropRef}>
          {conditions.map((cond, i) => {
            const colInfo = findColumnInfo(cond.column);
            const hasOptions = colInfo?.options && colInfo.options.length > 0;
            const isMultiple = colInfo?.type === 'tags';
            const selectedValues = cond.value ? cond.value.split(',') : [];

            return (

              <div key={`${i}-${cond.column}`} className="space-y-1">
                <div className="grid grid-cols-[130px_auto_1fr_auto] items-center gap-x-2 gap-y-1">
                  <div className="relative">
                    <button onClick={() => setShowFieldDrop(showFieldDrop === i ? null : i)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                      <span>{labelMap[cond.column] || colInfo?.label || (cond.column || '选择字段')}</span>
                      <ChevronDown size={13} style={{ color: 'var(--color-text-secondary)' }} />
                    </button>
                    {showFieldDrop === i && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-50 py-2 max-h-64 overflow-y-auto rounded-lg"
                        style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 8px 24px rgba(var(--color-text-dark-rgb), 0.12)' }}>
                        {CATEGORIES.map(cat => (
                          <div key={cat.key}>
                            <div className="px-3 py-1 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{cat.label}</div>
                            {columns.filter(c => c.category === cat.key && c.key !== 'contact').map(col => (
                              <button key={col.key}
                                className="block w-full text-left px-3 py-1.5 text-sm hover-warm transition-colors"
                                style={{ color: 'var(--color-text-primary)' }}
                                onClick={() => {
                                  onConditionsChange(conditions.map((c, idx) => idx === i ? { ...c, column: col.key, value: '' } : c));
                                  setShowFieldDrop(null);
                                  setShowValueDrop(normalizeOptions(col.options).length > 0 ? i : null);
                                }}>

                                {labelMap[col.key] || normalizeLabel(col.label) || col.key}
                              </button>
                            ))}
                          </div>
                        ))}
                        {columns.filter((c: Column) => c.category === 'custom').length > 0 && (
                          <div>
                            <div className="px-3 py-1 text-xs font-medium" style={{ color: 'var(--color-success)' }}>自定义字段</div>
                            {columns.filter((c: Column) => c.category === 'custom').map((col: Column) => (
                              <button key={col.key}
                                className="block w-full text-left px-3 py-1.5 text-sm hover-warm transition-colors"
                                style={{ color: 'var(--color-text-primary)' }}
                                onClick={() => {
                                  onConditionsChange(conditions.map((c, idx) => idx === i ? { ...c, column: col.key, value: '' } : c));
                                  setShowFieldDrop(null);
                                  setShowValueDrop(normalizeOptions(col.options).length > 0 ? i : null);
                                }}>
                                {normalizeLabel(col.label) || col.key}
                              </button>
                            ))}
                          </div>
                        )}
                        {(() => {
                          // 只显示在 field_mappings 中有定义、但不在前端固定列中的字段
                          const fixedKeys = new Set(['purpose', 'name', 'gender', 'age', 'height', 'weight', 'city', 'skinTone', 'faceType', 'eyeType', 'mouthType', 'bodyType', 'zodiac', 'bloodType', 'marriage', 'children', 'education', 'job', 'income', 'house', 'car', 'personality', 'smoke', 'drink', 'religion', 'pet', 'hobbies', 'food', 'sport', 'music', 'interestTags', 'expectation', 'contact']);
                          const customCols = columns.filter(c => !fixedKeys.has(c.key));
                          return customCols.length > 0 ? (
                            <div>
                              <div className="px-3 py-1 text-xs font-medium" style={{ color: 'var(--color-accent-teal)' }}>用户自定义标签</div>
                              {customCols.map(col => (
                                <button key={col.key}
                                  className="block w-full text-left px-3 py-1.5 text-sm hover-warm transition-colors"
                                  style={{ color: 'var(--color-text-primary)' }}
                                  onClick={() => {
                                    onConditionsChange(conditions.map((c, idx) => idx === i ? { ...c, column: col.key, value: '' } : c));
                                    setShowFieldDrop(null);
                                    setShowValueDrop(normalizeOptions(col.options).length > 0 ? i : null);
                                  }}>
                                  {normalizeLabel(col.label) || col.key}
                                </button>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>

                  <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>=</span>

                  <div className="relative">
                    {cond.column && hasOptions ? (
                      <button
                        onClick={() => setShowValueDrop(showValueDrop === i ? null : i)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left"
                        style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: cond.value ? 'var(--color-text-primary)' : 'var(--color-text-muted)', outline: 'none' }}>
                        <span>{cond.value || `选择${labelMap[cond.column] || colInfo?.label || ''}`}</span>
                        <ChevronDown size={13} style={{ color: 'var(--color-text-secondary)' }} />
                      </button>
                    ) : cond.column ? (
                      <input
                        className="w-full px-3 py-2 rounded-lg text-sm"
                        style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', outline: 'none' }}
                        placeholder={`输入${labelMap[cond.column] || colInfo?.label || '关键词'}`}
                        value={cond.value}
                        onFocus={e => (e.target.style.borderColor = '#F5B8A4')}
                        onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
                        onChange={e => updateCond(i, 'value', e.target.value)}
                      />
                    ) : (
                      <button
                        disabled
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left"
                        style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', outline: 'none' }}>
                        <span>输入关键词</span>
                      </button>
                    )}
                  </div>

                  <button onClick={() => removeCond(i)} className="p-1.5 rounded-md hover-warm" style={{ color: 'var(--color-text-muted)' }}>
                    <X size={14} />
                  </button>

                  {showValueDrop === i && hasOptions && (
                    <div className="col-span-4 grid grid-cols-subgrid">
                      <div></div>
                      <div></div>
                      <div className="w-full py-2 px-2 rounded-lg"
                        style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <div className="flex flex-wrap gap-1.5">
                          {colInfo?.options?.map(opt => {
                            const isSelected = isMultiple
                              ? selectedValues.includes(opt)
                              : cond.value === opt;
                            return (
                              <button
                                key={opt}
                                onClick={() => {
                                  if (isMultiple) {
                                    const newValues = isSelected
                                      ? selectedValues.filter(v => v !== opt)
                                      : [...selectedValues, opt];
                                    updateCond(i, 'value', newValues.join(','));
                                  } else {
                                    updateCond(i, 'value', opt);
                                    setShowValueDrop(null);
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${isSelected
                                  ? 'btn-primary text-white'
                                  : 'hover-warm'
                                  }`}
                                style={!isSelected ? { color: 'var(--color-text-primary)' } : {}}
                              >
                                {isSelected && <Check size={10} className="inline mr-1" />}
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div></div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        </div>

        <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(var(--color-border-warm-rgb), 0.4)' }}>
          <span className="text-xs mb-2.5 block font-medium" style={{ color: 'var(--color-text-secondary)' }}>快捷筛选</span>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_TAGS.map(tag => (
              <button key={tag.label} onClick={() => quickFilter(tag.key, tag.value)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium tag-bubble">
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        {/* [AGENT-DO-NOT-MODIFY] ============================================
             核心功能：多条件匹配（开始匹配按钮）
             注意：此区域为核心功能，请勿随意改动
             =================================================================== */}
        <button onClick={() => onHasSearchedChange(true)}
          className="btn-primary w-full mt-4 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold text-white">
          <Search size={15} /> 开始匹配
        </button>
      </div>
    </>
  );
}
