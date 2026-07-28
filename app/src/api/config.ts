/**
 * API 配置文件
 * 支持本地开发和线上部署的环境变量配置
 */

const ENV_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// 开发环境: /jzxr/api（通过代理转发到 http://localhost:8080/api）
// 生产环境: https://your_other_domain.com/api
export const API_BASE_URL = ENV_BASE_URL || '/jzxr/api';

// API 端点
export const API_ENDPOINTS = {
  // 用户相关
  users: '/users',
  userById: (id: string) => `/users/${encodeURIComponent(id)}`,
  myUser: '/users/my',
  userSearch: '/users/search',
  pendingUsers: '/users/pending',
  approveUser: (id: string) => `/users/${encodeURIComponent(id)}/approve`,
  rejectUser: (id: string) => `/users/${encodeURIComponent(id)}/reject`,
  batchUsers: '/users/batch',
  // 认证相关
  register: '/auth/register',
  login: '/auth/login',
  // 管理员相关
  adminLogin: '/admin/login',
  adminStats: '/admin/stats',
  // 评价相关
  ratings: '/ratings',
  // 举报相关
  reports: '/reports',
  // 联系方式解锁
  unlockContact: (id: string) => `/users/${encodeURIComponent(id)}/unlock-contact`,
  checkUnlock: (id: string) => `/users/${encodeURIComponent(id)}/check-unlock`,
  // 字段中文映射表
  fieldMappings: '/field-mappings',
  fieldLabels: '/field-mappings/labels',
} as const;

// 动态获取基础路径（支持 /jzxr 子路径部署和根路径部署）
export const getBasePath = (): string => {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/jzxr')) return '/jzxr';
  return '';
};

// 头像 URL 规范化 - 处理各种 avatar 存储格式：/uploads/avatars/x.jpg、/avatars/x.jpg、x.jpg、http(s)://...
export const normalizeAvatarUrl = (avatar: string | undefined | null): string | null => {
  if (!avatar) return null;
  if (avatar.startsWith('http') || avatar.startsWith('data:')) return avatar;
  const base = getBasePath();
  if (avatar.startsWith('/uploads/') || avatar.startsWith('/avatars/')) {
    return `${base}${avatar}`
  }
  if (avatar.startsWith('/')) {
    return `${base}${avatar}`
  }
  return `${base}/uploads/avatars/${avatar}`
};

// 请求拦截器和安全配置
export const createSecureRequest = (endpoint: string, options: RequestInit = {}) => {
  // 验证端点安全性
  if (endpoint.includes('..') || endpoint.includes('<') || endpoint.includes('>')) {
    throw new Error('Invalid endpoint');
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };

  return fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: 'include', // 包含cookies
  });
};

// 安全的请求函数
export const secureFetch = async (endpoint: string, options: RequestInit = {}) => {
  try {
    // 防止重复请求
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

    const response = await createSecureRequest(endpoint, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 检查响应状态
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return response;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('请求超时');
    }
    throw error;
  }
};