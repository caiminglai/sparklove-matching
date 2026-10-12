/**
 * 前端鉴权工具
 * 替代 11 个文件中重复的 localStorage.getItem('auth_token') + 手写 Authorization header
 */

import { API_BASE_URL } from '../api/config'

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

/**
 * 清除本地 token（后端回 401 时调用）
 * 过期 token 不清掉的话，用户每次点都会被顶回"token无效"，永远进不了登录页
 */
export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY)
}

/**
 * 退出登录：清本地 token + 让后端下发过期指令清掉 httpOnly cookie
 *
 * 为什么必须打这一发：登录时后端把同一个 token 也写进了 httpOnly cookie
 * （backend/routes/auth.js 的 setAuthCookie），而 backend/server.js 在每个请求进来的
 * 时候会把 cookie 里的 token 桥接成 Authorization 头。只删 localStorage 的话，
 * 浏览器看起来退出了，接下来 7 天里任何带 credentials 的请求后端仍然认得出你是谁，
 * 「我的资料」「解锁联系方式」这类接口照样通。
 *
 * 网络失败也要把本地清干净：后端不可达时，留在 localStorage 的那枚 token
 * 只会让用户下次进来以为自己还是登录态。返回是否真的通知到了后端，供调用方按需提示。
 */
export async function logoutUser(): Promise<boolean> {
  clearAuthToken()
  try {
    const res = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
    return res.ok
  } catch {
    return false
  }
}
