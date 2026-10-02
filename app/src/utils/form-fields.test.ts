/**
 * 填表隐藏项与标签点击语义的单测。
 * 隐藏清单是前后端同一份口径（后端派生见 backend/utils/profile-derive.js），
 * 少一条就会重新追问、多一条就会把仍在筛选/详情页使用的项挡掉，所以钉住集合内容。
 */
import { describe, it, expect } from 'vitest'
import { applyTagToggle, FORM_HIDDEN_KEYS } from './form-fields'

describe('FORM_HIDDEN_KEYS', () => {
  it('只隐藏这四项，且都不在筛选与展示的删除清单里', () => {
    expect([...FORM_HIDDEN_KEYS].sort()).toEqual(
      ['age', 'interestTags', 'marriage', 'zodiac'].sort(),
    )
  })

  it('基础来源项绝不能被一起隐藏', () => {
    for (const k of ['birthday', 'relationship_status', 'hobbies', 'sport']) {
      expect(FORM_HIDDEN_KEYS.has(k)).toBe(false)
    }
  })
})

describe('applyTagToggle', () => {
  it('普通标签项保持多选，重复点同一个则取消', () => {
    expect(applyTagToggle([], 'hobbies', '动漫')).toEqual(['动漫'])
    expect(applyTagToggle(['动漫'], 'hobbies', '游戏')).toEqual(['动漫', '游戏'])
    expect(applyTagToggle(['动漫', '游戏'], 'hobbies', '动漫')).toEqual(['游戏'])
  })

  it('互斥项只留最后一次点击', () => {
    expect(applyTagToggle(['经常旅行'], 'travel_frequency', '宅家不出门')).toEqual(['宅家不出门'])
    expect(applyTagToggle(['经常旅行', '偶尔旅行'], 'travel_frequency', '很少旅行')).toEqual([
      '很少旅行',
    ])
    expect(applyTagToggle(['经常旅行'], 'travel_frequency', '经常旅行')).toEqual([])
  })

  it('互斥白名单外的项不受影响，也不改动传入数组', () => {
    const cur = ['微信']
    applyTagToggle(cur, 'social_apps', 'QQ')
    expect(cur).toEqual(['微信'])
  })
})
