// pg 的 NUMERIC 回传是字符串（"29.90"），前端直接相加会变成拼接；
// 金额展示统一走这里：先 Number 再定两位小数。
export function formatYuan(value: unknown): string {
  const num = Number(value)
  return (Number.isFinite(num) ? num : 0).toFixed(2)
}
