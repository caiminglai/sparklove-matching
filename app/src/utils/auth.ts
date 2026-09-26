/**
 * 前端鉴权工具
 * 替代 11 个文件中重复的 localStorage.getItem('auth_token') + 手写 Authorization header
 */

const AUTH_TOKEN_KEY = 'auth_token'

/**
 * 从 localStorage 读取 auth_token
 * @returns token 字符串，未登录时返回 null
 */
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

/**
 * 构造带 Authorization 的请求头对象
 * - 已登录：返回 { 'Authorization': 'Bearer xxx' }
 * - 未登录：返回 {}（空对象，不影响其他 header 合并）
 *
 * 用法：
 *   const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
 *   // 或守卫式：
 *   if (!getAuthToken()) return;
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
