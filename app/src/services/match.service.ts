/**
 * [AGENT-DO-NOT-MODIFY] ============================================
 * 核心功能：多条件匹配服务
 * 负责：根据条件匹配用户、计算匹配度分数
 * 注意：此文件为核心功能，请勿随意改动
 * ================================================================
 */

import type { Row, MatchCondition } from '../data/types'

export function matchRows(
  rows: Row[],
  conditions: MatchCondition[],
): { row: Row; score: number; matches: string[] }[] {
  const activeConditions = conditions.filter((c) => c.column && c.value)

  return rows
    .map((row) => {
      let score = 0
      const matches: string[] = []
      let allMatch = true
      for (const cond of activeConditions) {
        const val = String(row.data?.[cond.column as keyof typeof row.data] || '').toLowerCase()
        const search = cond.value.toLowerCase()
        let matched = false

        if (cond.column === 'age' && search.includes('-')) {
          const [min, max] = search.split('-').map(Number)
          const age = Number(val)
          if (!isNaN(age) && !isNaN(min) && !isNaN(max) && age >= min && age <= max) {
            matched = true
          }
        } else if (cond.column === 'age' && (search.startsWith('>') || search.startsWith('<'))) {
          const age = Number(val)
          const cmp = Number(search.slice(1))
          if (!isNaN(age) && !isNaN(cmp)) {
            if (search.startsWith('>') && age > cmp) matched = true
            if (search.startsWith('<') && age < cmp) matched = true
          }
        } else if (/[,，]/.test(search)) {
          // 多选下拉会把几个值拼成 "火锅,烧烤" 写进条件（SearchPanel 里 selectedValues 就是按逗号切的），
          // 而这里以前只拿整串去 includes ⇒ 等于要求资料格子里原样出现「火锅,烧烤」才算命中，
          // 多选基本全筛空，可首页那句提示又明明白白写着「多项选择可用逗号分隔」。
          // 多个值之间按「或」算：勾了火锅和烧烤，爱吃任一样的人都该出来。
          const alternatives = search
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean)
          matched = alternatives.some((alt) => val.includes(alt))
        } else if (val.includes(search)) {
          matched = true
        }

        if (matched) {
          score += 1
          matches.push(`${cond.column}:${cond.value}`)
        } else {
          allMatch = false
        }
      }
      return { row, score, matches, allMatch }
    })
    .filter((r) => r.allMatch)
    .map(({ row, score, matches }) => ({ row, score, matches }))
    .sort((a, b) => b.score - a.score)
}
