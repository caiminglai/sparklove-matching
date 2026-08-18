/**
 * 颜色工具：hex 转 rgba
 * 替代直接字符串拼接（#RRGGBB + 'cc' = #RRGGBBcc 9 字符无效 CSS）
 */

/**
 * hex 颜色 + alpha 转 rgba 字符串
 * @param hex 6 位 hex 颜色（#E87A5D 或 E87A5D 均可）
 * @param alpha 透明度 0-1（如 0.8）
 * @returns rgba 字符串，如 'rgba(232, 122, 93, 0.8)'
 *
 * 示例：
 *   hexToRgba('#E87A5D', 0.8)  // 'rgba(232, 122, 93, 0.8)'
 *   hexToRgba('E87A5D', 0.5)  // 'rgba(232, 122, 93, 0.5)'
 */
export function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
