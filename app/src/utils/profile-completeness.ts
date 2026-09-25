/**
 * 资料完整度计算（纯函数，无副作用、无依赖，可直接单测）
 *
 * 数据来源：GET /api/users/my -> { user: { data: { ... } } }（ProfilePage.loadMyData）
 * 字段名来源：后端 /api/field-mappings（54 个字段）+ DEFAULT_COLUMNS（app/src/data/constants.ts）
 */

export interface CompletenessField {
  /** user.data 里的真实字段名 */
  key: string;
  /** 展示给用户的中文名 */
  label: string;
}

/**
 * 参与统计的字段（分母）。
 * 选这 5 个的理由：它们是「资料卡片在列表页能不能被人认出来」的门面字段——头像 + 昵称 + 性别 + 城市 + 职业；
 * 其余 49 个 /api/field-mappings 字段（肤色/星座/依恋类型…）都是可选细化项，缺了不影响卡片展示，所以不进分母。
 * 红线：手机号、身份证号、真实姓名、邮箱、token、邮箱验证码一律不参与统计（本站资料表单里对应 contact 字段
 * 实际存的是手机号/微信号，同样排除），也不得写入本地存储（见 services/draft.service.ts）。
 */
export const PROFILE_COMPLETENESS_FIELDS: readonly CompletenessField[] = Object.freeze([
  { key: 'avatar', label: '头像' },
  { key: 'name', label: '昵称' },
  { key: 'gender', label: '性别' },
  { key: 'city', label: '城市' },
  { key: 'job', label: '职业' },
]);

/** 后端/历史数据里常见的脏占位值：看起来有内容，实际等于没填 */
export const DIRTY_PLACEHOLDER_VALUES: ReadonlySet<string> = new Set([
  'null',
  'undefined',
  'nan',
  '[]',
  '{}',
  '[object object]',
  '—',
  '-',
]);

/** 单个字段是否算「已填」：空串 / 纯空格 / null / undefined / 脏占位值都算未填 */
export function isFieldFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    return !DIRTY_PLACEHOLDER_VALUES.has(trimmed.toLowerCase());
  }

  if (typeof value === 'number') {
    // 0 / NaN / Infinity 都视为未填（年龄、身高为 0 没有业务含义）
    return Number.isFinite(value) && value !== 0;
  }

  if (typeof value === 'boolean') return value;

  if (Array.isArray(value)) return value.some(item => isFieldFilled(item));

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(item => isFieldFilled(item));
  }

  return false;
}

export interface CompletenessResult {
  filled: number;
  total: number;
  /** 0 ~ 1 */
  ratio: number;
  /** 百分比整数，0 ~ 100 */
  percent: number;
  /** 未填字段的中文名，用于提示「还差什么」 */
  missing: string[];
}

/**
 * 计算资料完整度。
 * @param data 用户可填字段集合（user.data / 编辑中的 formData），传 null、undefined 都按「全空」处理
 */
export function computeProfileCompleteness(
  data: Record<string, unknown> | null | undefined,
): CompletenessResult {
  const source = data && typeof data === 'object' ? data : {};
  const missing: string[] = [];
  let filled = 0;

  for (const field of PROFILE_COMPLETENESS_FIELDS) {
    if (isFieldFilled(source[field.key])) {
      filled += 1;
    } else {
      missing.push(field.label);
    }
  }

  const total = PROFILE_COMPLETENESS_FIELDS.length;
  const ratio = total === 0 ? 0 : filled / total;
  return { filled, total, ratio, percent: Math.round(ratio * 100), missing };
}
