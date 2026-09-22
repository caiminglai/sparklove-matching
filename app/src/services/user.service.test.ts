/**
 * user.service 单元测试
 * 测试：loadRows、saveRows、loadColumns、addColumn、deleteRow、addRow、getCategoryColumns
 * 注意：涉及 localStorage 的操作需要 mock
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => Object.keys(store).forEach(k => delete store[k])),
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });
  // mock fetch
  Object.defineProperty(globalThis, 'fetch', { value: vi.fn(), writable: true });
});

describe('loadRows', () => {
  it('无缓存时返回空列表（真实数据由 /users 接口填充）', async () => {
    const { loadRows } = await import('./user.service');
    const rows = loadRows();
    expect(rows).toHaveLength(0);
  });

  it('有缓存时解析并返回', async () => {
    const cachedRow = {
      id: 'r_test',
      deposit: 29.9,
      createdAt: Date.now(),
      data: { name: '测试用户', gender: '女', age: 25, height: 165, weight: '50kg', skinTone: '', zodiac: '', bloodType: '', city: '', marriage: '', children: '', education: '', job: '', income: '', house: '', car: '', faceType: '', eyeType: '', mouthType: '', bodyType: '', hobbies: '', food: '', sport: '', music: '', smoke: '', drink: '', religion: '', pet: '', personality: '', expectation: '', contact: '', interestTags: '', purpose: '' },
    };
    store['match_rows'] = JSON.stringify([cachedRow]);
    store['match_version'] = 'v6';

    const { loadRows } = await import('./user.service');
    const rows = loadRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].data?.name).toBe('测试用户');
  });
});

describe('loadColumns', () => {
  it('无缓存时返回默认列', async () => {
    const { loadColumns } = await import('./user.service');
    const cols = loadColumns();
    expect(cols.length).toBeGreaterThan(0);
    // 验证默认列包含必要字段
    expect(cols.find(c => c.key === 'name')).toBeDefined();
    expect(cols.find(c => c.key === 'gender')).toBeDefined();
  });

  it('与默认列合并时默认配置优先', async () => {
    // 模拟旧缓存中有错误的 type/category
    const savedCols = [
      { key: 'gender', label: '性别', type: 'text', category: '自定义分类', options: ['X', 'Y'] },
    ];
    store['match_columns'] = JSON.stringify(savedCols);
    store['match_version'] = 'v6';

    const { loadColumns } = await import('./user.service');
    const cols = loadColumns();
    const genderCol = cols.find(c => c.key === 'gender');
    expect(genderCol?.type).toBe('select'); // 应该恢复为默认的 select
    expect(genderCol?.category).toBe('基本'); // 应该恢复为默认的 '基本'
  });
});

describe('addColumn', () => {
  it('添加列后保存到 localStorage', async () => {
    const { loadColumns, addColumn } = await import('./user.service');
    const cols = loadColumns();
    const newCol = { key: 'custom_field', label: '自定义字段', type: 'text' as const, category: '其他' };
    const updated = addColumn(cols, newCol);
    expect(updated).toHaveLength(cols.length + 1);
    expect(updated.find(c => c.key === 'custom_field')).toBeDefined();
  });
});

describe('deleteRow', () => {
  it('删除指定行并保存', async () => {
    // 先写入数据
    const testRows = [
      { id: 'r1', deposit: 29.9, createdAt: Date.now(), data: { name: '用户1', gender: '', age: '', height: '', weight: '', skinTone: '', zodiac: '', bloodType: '', city: '', marriage: '', children: '', education: '', job: '', income: '', house: '', car: '', faceType: '', eyeType: '', mouthType: '', bodyType: '', hobbies: '', food: '', sport: '', music: '', smoke: '', drink: '', religion: '', pet: '', personality: '', expectation: '', contact: '', interestTags: '', purpose: '' } },
      { id: 'r2', deposit: 29.9, createdAt: Date.now(), data: { name: '用户2', gender: '', age: '', height: '', weight: '', skinTone: '', zodiac: '', bloodType: '', city: '', marriage: '', children: '', education: '', job: '', income: '', house: '', car: '', faceType: '', eyeType: '', mouthType: '', bodyType: '', hobbies: '', food: '', sport: '', music: '', smoke: '', drink: '', religion: '', pet: '', personality: '', expectation: '', contact: '', interestTags: '', purpose: '' } },
    ];
    store['match_rows'] = JSON.stringify(testRows);
    store['match_version'] = 'v6';

    const { deleteRow } = await import('./user.service');
    const remaining = deleteRow('r1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('r2');
  });
});

describe('addRow', () => {
  it('添加行后保存', async () => {
    const testRows = [
      { id: 'r1', deposit: 29.9, createdAt: Date.now(), data: { name: '用户1', gender: '', age: '', height: '', weight: '', skinTone: '', zodiac: '', bloodType: '', city: '', marriage: '', children: '', education: '', job: '', income: '', house: '', car: '', faceType: '', eyeType: '', mouthType: '', bodyType: '', hobbies: '', food: '', sport: '', music: '', smoke: '', drink: '', religion: '', pet: '', personality: '', expectation: '', contact: '', interestTags: '', purpose: '' } },
    ];
    store['match_rows'] = JSON.stringify(testRows);
    store['match_version'] = 'v6';

    const newRow = { id: 'r_new', deposit: 29.9, createdAt: Date.now(), data: { name: '新用户', gender: '', age: '', height: '', weight: '', skinTone: '', zodiac: '', bloodType: '', city: '', marriage: '', children: '', education: '', job: '', income: '', house: '', car: '', faceType: '', eyeType: '', mouthType: '', bodyType: '', hobbies: '', food: '', sport: '', music: '', smoke: '', drink: '', religion: '', pet: '', personality: '', expectation: '', contact: '', interestTags: '', purpose: '' } };

    const { addRow } = await import('./user.service');
    const updated = addRow(testRows, newRow);
    expect(updated).toHaveLength(2);
    expect(updated.find(r => r.id === 'r_new')).toBeDefined();
  });
});

describe('getCategoryColumns', () => {
  it('按分类筛选列', async () => {
    const { loadColumns, getCategoryColumns } = await import('./user.service');
    const cols = loadColumns();
    const basicCols = getCategoryColumns(cols, '基本');
    expect(basicCols.length).toBeGreaterThan(0);
    basicCols.forEach(col => {
      expect(col.category).toBe('基本');
    });
  });

  it('不存在的分类返回空数组', async () => {
    const { loadColumns, getCategoryColumns } = await import('./user.service');
    const cols = loadColumns();
    const result = getCategoryColumns(cols, '不存在的分类');
    expect(result).toHaveLength(0);
  });
});

describe('syncRowsFromServer', () => {
  it('API 成功时更新 localStorage', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        data: [{
          id: 'r_server',
          deposit: 29.9,
          createdAt: Date.now(),
          data: { name: '服务器用户', gender: '男', age: 30, height: 180, weight: '70kg', skinTone: '', zodiac: '', bloodType: '', city: '', marriage: '', children: '', education: '', job: '', income: '', house: '', car: '', faceType: '', eyeType: '', mouthType: '', bodyType: '', hobbies: '', food: '', sport: '', music: '', smoke: '', drink: '', religion: '', pet: '', personality: '', expectation: '', contact: '', interestTags: '', purpose: '' },
        }],
      }),
    });
    (globalThis as Record<string, unknown>).fetch = mockFetch;

    const { syncRowsFromServer } = await import('./user.service');
    const rows = await syncRowsFromServer();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('r_server');
  });

  it('API 失败时返回空数组', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('网络错误'));
    (globalThis as Record<string, unknown>).fetch = mockFetch;

    const { syncRowsFromServer } = await import('./user.service');
    const rows = await syncRowsFromServer();
    expect(rows).toHaveLength(0);
  });
});
