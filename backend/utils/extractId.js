/**
 * 路径 ID 提取工具
 * 替代 server.js / routes/users.js / routes/reports.js 中重复的 extractId/extractUserId/extractReportId
 */

/**
 * 从 URL 路径中提取指定前缀后的 ID 段
 * @param {string} pathname URL 路径，如 '/api/users/abc123'
 * @param {string} prefix 路径前缀，如 'users'
 * @returns {string|null} ID 字符串（如 'abc123'），未匹配返回 null
 *
 * 示例：
 *   extractId('/api/users/abc123', 'users')  // 'abc123'
 *   extractId('/api/reports/42', 'reports')    // '42'
 *   extractId('/api/users', 'users')          // null
 */
function extractId(pathname, prefix) {
  const parts = pathname.split('/').filter(p => p);
  const idx = parts.indexOf(prefix);
  if (idx !== -1 && idx + 1 < parts.length) {
    return parts[idx + 1];
  }
  return null;
}

module.exports = { extractId };
