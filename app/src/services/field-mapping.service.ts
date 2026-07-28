/**
 * 字段中文映射服务
 * 职责：从后端获取字段映射数据，作为字段标签和选项的唯一数据源
 * 策略：优先从 API 获取，失败时回退到 constants.ts 硬编码默认值
 */

import { API_BASE_URL } from '../api/config';
import type { Column } from '../data/types';
import { FIELD_LABELS, DEFAULT_COLUMNS } from '../data/constants';

const LS_KEY = 'field_mappings_cache';
const LS_LABELS_KEY = 'field_labels_cache';

// 缓存结构：{ value: T, version: string }
interface CachedData<T> { value: T; version: string; }

function readCache<T>(key: string): CachedData<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.value && data.version) return data as CachedData<T>;
  } catch { console.warn('readCache: 缓存读取失败'); }
  return null;
}

function writeCache<T>(key: string, value: T, version: string) {
  try {
    localStorage.setItem(key, JSON.stringify({ value, version }));
  } catch { console.warn('writeCache: 缓存写入失败'); }
}

// 从后端获取字段映射，转为 Column[] 格式（ETag 版本缓存）
export async function fetchFieldMappings(): Promise<Column[]> {
  const cached = readCache<Column[]>(LS_KEY);
  const headers: Record<string, string> = {};
  if (cached) headers['If-None-Match'] = cached.version;

  try {
    const res = await fetch(`${API_BASE_URL}/field-mappings`, { headers });
    // 304 = 数据未变，直接用缓存
    if (res.status === 304 && cached) return cached.value;
    // 200 = 有新数据
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        const columns: Column[] = data.data.map((m: { field_key: string; field_label: string; field_type: string; options?: string[]; field_category?: string }) => ({
          key: m.field_key,
          label: m.field_label,
          type: m.field_type,
          options: m.options || [],
          category: m.field_category || '其他',
        }));
        const version = res.headers.get('ETag') || String(Date.now());
        writeCache(LS_KEY, columns, version);
        return columns;
      }
    }
  } catch { console.warn('fetchFieldMappings: API不可用时回退'); }
  // 最终回退：缓存 > 硬编码
  return cached?.value || DEFAULT_COLUMNS;
}

// 从后端获取字段标签映射表（ETag 版本缓存）
export async function fetchFieldLabels(): Promise<Record<string, string>> {
  const cached = readCache<Record<string, string>>(LS_LABELS_KEY);
  const headers: Record<string, string> = {};
  if (cached) headers['If-None-Match'] = cached.version;

  try {
    const res = await fetch(`${API_BASE_URL}/field-mappings/labels`, { headers });
    if (res.status === 304 && cached) return cached.value;
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data) {
        const version = res.headers.get('ETag') || String(Date.now());
        writeCache(LS_LABELS_KEY, data.data, version);
        return data.data as Record<string, string>;
      }
    }
  } catch { console.warn('fetchFieldLabels: API不可用时回退'); }
  return cached?.value || FIELD_LABELS;
}

// 同步获取默认列（用于初始化，不等待API）
export function getDefaultColumns(): Column[] {
  return DEFAULT_COLUMNS;
}
