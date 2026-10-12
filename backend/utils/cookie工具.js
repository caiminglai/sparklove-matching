// ============================================================
// Cookie 工具 - httpOnly cookie 管理
// 用于替代 localStorage 存储 auth_token，防止 XSS 攻击
// ============================================================

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(pair => {
    const [key, ...rest] = pair.split('=');
    const k = key && key.trim();
    if (k) cookies[k] = decodeURIComponent(rest.join('=').trim());
  });
  return cookies;
}

function getAuthTokenFromCookie(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies.auth_token || null;
}

function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `auth_token=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=604800'
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  // 删除 cookie 靠的是「同名 + 同 Path（同域）」匹配，属性不一致时浏览器把它当成
  // 另一个作用域的新 cookie，auth_token 原样留着——退出点了、cookie 还在。
  // 所以这里的 Path/HttpOnly/SameSite/Secure 必须和 setAuthCookie 一一对齐
  const parts = [
    'auth_token=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

module.exports = { parseCookies, getAuthTokenFromCookie, setAuthCookie, clearAuthCookie };
