/**
 * 联系方式脱敏工具
 * - 11 位手机号：保留前 3 + 后 4，中间 4 位替换为 *
 * - 其他字符串：保留前 3 + 后 2，中间替换为 ****
 */

/**
 * 对联系方式进行脱敏处理
 * @param contact 原始联系方式（手机号/微信号等）
 * @returns 脱敏后的字符串；输入为空则返回空字符串
 */
export function maskContact(contact: string): string {
  if (!contact) return ''
  if (/^\d{11}$/.test(contact)) {
    return contact.slice(0, 3) + '****' + contact.slice(7)
  }
  return contact.slice(0, 3) + '****' + contact.slice(-2)
}
