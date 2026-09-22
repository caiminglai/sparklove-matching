/**
 * 用户数据服务（业务逻辑层）
 * 负责：用户数据的增删改查、本地存储管理、与后端 API 的数据同步
 * 调用：api/config 中的 API 配置
 */

import { API_BASE_URL, API_ENDPOINTS } from '../api/config';
import type { Row, Column, FlatRow } from '../data/types';
import { DEFAULT_COLUMNS } from '../data/constants';
import { getAuthToken, getAuthHeaders } from '../utils/auth';

const LS_ROWS = 'match_rows';
const LS_COLUMNS = 'match_columns';
const DATA_VERSION = 'v6';

function checkVersion(): void {
  const stored = localStorage.getItem('match_version');
  if (stored !== DATA_VERSION) {
    localStorage.removeItem(LS_ROWS);
    // 不清空 match_columns：让 loadColumns 的合并逻辑自动修正默认字段，
    // 同时保留用户自定义字段和已建立的条件。
    localStorage.setItem('match_version', DATA_VERSION);
  }
}

export function loadRows(): Row[] {
  checkVersion();

  try {
    const raw = localStorage.getItem(LS_ROWS);
    if (raw) {
      const rows = JSON.parse(raw);
      return rows.map((row: FlatRow) => {
        if (row.data) return row;
        return {
          ...row,
          data: {
            name: row.name || '',
            gender: row.gender || '',
            age: row.age || '',
            height: row.height || '',
            weight: row.weight || '',
            skinTone: row.skinTone || '',
            zodiac: row.zodiac || '',
            bloodType: row.bloodType || '',
            city: row.city || '',
            marriage: row.marriage || '',
            children: row.children || '',
            education: row.education || '',
            job: row.job || '',
            income: row.income || '',
            house: row.house || '',
            car: row.car || '',
            faceType: row.faceType || '',
            eyeType: row.eyeType || '',
            mouthType: row.mouthType || '',
            bodyType: row.bodyType || '',
            hobbies: row.hobbies || '',
            food: row.food || '',
            sport: row.sport || '',
            music: row.music || '',
            smoke: row.smoke || '',
            drink: row.drink || '',
            religion: row.religion || '',
            pet: row.pet || '',
            personality: row.personality || '',
            expectation: row.expectation || '',
            contact: row.contact || '',
            interestTags: row.interestTags || '',
            purpose: row.purpose || ''
          }
        };
      });
    }
  } catch { console.warn('loadRows: localStorage JSON 解析失败'); }

  // 无缓存时返回空数组：真实数据由首页的 /users 请求填充，
  // 此处若返回假人，接口失败时访客会看到不存在的会员。
  return [];
}

export function saveRows(rows: Row[]) {
  localStorage.setItem(LS_ROWS, JSON.stringify(rows));
  try {
    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
    fetch(`${API_BASE_URL}/users/batch`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(rows)
    });
  } catch (e) { console.warn('saveRows: 网络同步失败', e); }
}

export async function syncRowsFromServer(): Promise<Row[]> {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.users}`, {
      headers,
      credentials: 'include',
    });
    const data = await res.json();
    if (data.success && data.data) {
      const cleaned = data.data.map((row: FlatRow) => {
        if (row.data) return row;
        return {
          ...row,
          data: {
            name: row.name || '', gender: row.gender || '', age: row.age || '',
            height: row.height || '', weight: row.weight || '', skinTone: row.skinTone || '',
            zodiac: row.zodiac || '', bloodType: row.bloodType || '', city: row.city || '',
            marriage: row.marriage || '', children: row.children || '', education: row.education || '',
            job: row.job || '', income: row.income || '', house: row.house || '',
            car: row.car || '', faceType: row.faceType || '', eyeType: row.eyeType || '',
            mouthType: row.mouthType || '', bodyType: row.bodyType || '',
            hobbies: row.hobbies || '', food: row.food || '', sport: row.sport || '',
            music: row.music || '', smoke: row.smoke || '', drink: row.drink || '',
            religion: row.religion || '', pet: row.pet || '', personality: row.personality || '',
            expectation: row.expectation || '', contact: row.contact || '',
            interestTags: row.interestTags || '', purpose: row.purpose || ''
          }
        };
      });
      localStorage.setItem(LS_ROWS, JSON.stringify(cleaned));
      return cleaned;
    }
  } catch (e) { console.warn('syncRowsFromServer: 同步失败', e); }
  return [];
}

export function loadColumns(): Column[] {
  checkVersion();

  try {
    const raw = localStorage.getItem(LS_COLUMNS);
    if (raw) {
      const saved: Column[] = JSON.parse(raw);
      if (Array.isArray(saved) && saved.length > 0) {
        // 与默认列配置合并，默认配置优先，防止旧缓存中的错误 options/type/category 覆盖正确值
        const merged = saved.map(savedCol => {
          const defaultCol = DEFAULT_COLUMNS.find(c => c.key === savedCol.key);
          if (!defaultCol) return savedCol;
          return {
            ...defaultCol,
            ...savedCol,
            type: defaultCol.type,
            category: defaultCol.category,
            options: defaultCol.options,
          };
        });
        localStorage.setItem(LS_COLUMNS, JSON.stringify(merged));
        return merged;
      }
    }
  } catch { console.warn('loadColumns: localStorage JSON 解析失败'); }
  return DEFAULT_COLUMNS;
}

export function addColumn(columns: Column[], col: Column): Column[] {
  const next = [...columns, col];
  localStorage.setItem(LS_COLUMNS, JSON.stringify(next));
  return next;
}

export function deleteRow(id: string): Row[] {
  const rows = loadRows().filter(r => r.id !== id);
  saveRows(rows);
  return rows;
}

export function addRow(rows: Row[], row: Row): Row[] {
  const next = [...rows, row];
  saveRows(next);
  return next;
}

export function getCategoryColumns(columns: Column[], category: string): Column[] {
  return columns.filter(c => c.category === category);
}
