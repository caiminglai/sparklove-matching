/**
 * API 配置文件
 * 支持本地开发和线上部署的环境变量配置
 */

const ENV_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// ======================================================
// 【关键修复：开发模式直连后端，绕开 Vite proxy + SSE reset 连接池复用】
// 根因：Vite 开发模式下 /@vite/client 建立 SSE 长连接，且该连接会因 HMR 触发
//       反复「断开→重连」(RST)。Chrome 对同一 host 最多 6 条 HTTP/1.1 连接，
//       发往 4000 /api 的代理请求和 SSE 长连接共享同 6 条连接，若
//       某条请求刚好排在 SSE 长连接即将 RST 的那条 TCP socket 上，就会被
//       连带 abort → Chrome 控制台红字 net::ERR_ABORTED。
//
//       其他 3 个首屏接口靠运气抢到另外 5 条干净连接就成功，field-mappings
//       因为首屏时序/头部因素经常排到那条倒霉连接上。
//
// 解法：开发模式把 API_BASE_URL 改为直连后端 http://localhost:8080/api，
//       不同 origin → 不同连接池 → 与 Vite 的 SSE 连接完全物理隔离，
//       100% 不会被 SSE reset 连带中止。
//       后端已正确配置 CORS（允许 http://localhost:4000 + credentials），
//       实测直连 fetch 200 成功（见 console 验证）。
//
// 生产构建：VITE_API_BASE_URL 环境变量会覆盖（或用默认相对路径 /api），
//         生产无 SSE 也无 proxy，不会有此问题。
// ======================================================
const DEFAULT_DEV_BASE_URL = 'http://localhost:8080/api';
const DEFAULT_PROD_BASE_URL = '/api';
export const API_BASE_URL = ENV_BASE_URL || (import.meta.env.DEV ? DEFAULT_DEV_BASE_URL : DEFAULT_PROD_BASE_URL);

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

// 头像 URL 规范化 - 处理各种 avatar 存储格式：/uploads/avatars/x.jpg、/avatars/x.jpg、x.jpg、http(s)://...
export const normalizeAvatarUrl = (avatar: string | undefined | null): string | null => {
  if (!avatar) return null;
  if (avatar.startsWith('http') || avatar.startsWith('data:')) return avatar;
  if (avatar.startsWith('/uploads/') || avatar.startsWith('/avatars/')) {
    return `${avatar}`
  }
  if (avatar.startsWith('/')) {
    return `${avatar}`
  }
  return `/uploads/avatars/${avatar}`
};

