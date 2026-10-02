/**
 * 资料派生的单测：年龄/星座/婚姻/兴趣标签都不再单独提问，改由基础答案算出来，
 * 算错就会直接落到年龄筛选和匹配向量上，所以每个边界都钉住。
 *
 * 后端没有自己的 runner，这段与 utils/payment-verify.test.ts 同口径：createRequire 直接拉后端源文件。
 */
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'

interface Birthday {
  year: number | null
  month: number | null
  day: number | null
}

interface ProfileDerive {
  parseBirthday: (raw: unknown) => Birthday | null
  deriveAgeFromBirthday: (raw: unknown, nowMs?: number) => string
  deriveZodiacFromBirthday: (raw: unknown) => string
  deriveMarriageFromRelationshipStatus: (status: unknown) => string
  deriveInterestTags: (hobbies: unknown, sport: unknown) => string
  deriveProfileFields: (data: Record<string, unknown>, nowMs?: number) => Record<string, unknown>
}

const nodeRequire = createRequire(import.meta.url)
const derive = nodeRequire('../../../backend/utils/profile-derive.js') as unknown as ProfileDerive

// 基准时刻：2026-10-02 中午（UTC），各时区落在这同一天或相邻一天的中午附近，边界用例都留了余量
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0)

describe('parseBirthday', () => {
  it('字段说明里给的两种写法都认', () => {
    expect(derive.parseBirthday('1995-06')).toEqual({ year: 1995, month: 6, day: null })
    expect(derive.parseBirthday('19950615')).toEqual({ year: 1995, month: 6, day: 15 })
  })

  it('分隔符与中文年月日、缺年、缺项都能解析', () => {
    expect(derive.parseBirthday('1995/6/5')).toEqual({ year: 1995, month: 6, day: 5 })
    expect(derive.parseBirthday('1995年6月15日')).toEqual({ year: 1995, month: 6, day: 15 })
    expect(derive.parseBirthday('1995.06.15')).toEqual({ year: 1995, month: 6, day: 15 })
    expect(derive.parseBirthday('6月15日')).toEqual({ year: null, month: 6, day: 15 })
    expect(derive.parseBirthday('1995')).toEqual({ year: 1995, month: null, day: null })
    expect(derive.parseBirthday('199506')).toEqual({ year: 1995, month: 6, day: null })
  })

  it('空值与越界一律判不合法，不猜', () => {
    expect(derive.parseBirthday('')).toBeNull()
    expect(derive.parseBirthday(null)).toBeNull()
    expect(derive.parseBirthday('不详')).toBeNull()
    expect(derive.parseBirthday('1899-06-15')).toBeNull()
    expect(derive.parseBirthday('1995-13-01')).toBeNull()
    expect(derive.parseBirthday('1995-06-40')).toBeNull()
  })
})

describe('deriveAgeFromBirthday', () => {
  it('已过生日与没过生日各算一次', () => {
    expect(derive.deriveAgeFromBirthday('1995-09-15', NOW)).toBe('31')
    expect(derive.deriveAgeFromBirthday('1995-10-15', NOW)).toBe('30')
    expect(derive.deriveAgeFromBirthday('19951015', NOW)).toBe('30')
  })

  it('只到月份或只到年份时按月初/年初计，不当年岁模糊处理', () => {
    expect(derive.deriveAgeFromBirthday('1995-06', NOW)).toBe('31')
    expect(derive.deriveAgeFromBirthday('1995', NOW)).toBe('31')
    const y = new Date(NOW).getFullYear()
    expect(derive.deriveAgeFromBirthday(`${y}-01-01`, NOW)).toBe('0')
    expect(derive.deriveAgeFromBirthday(`${y}-12-25`, NOW)).toBe('')
  })

  it('缺来源就不产出，保留调用方已有的值', () => {
    expect(derive.deriveAgeFromBirthday('', NOW)).toBe('')
    expect(derive.deriveAgeFromBirthday('6月15日', NOW)).toBe('')
  })
})

describe('deriveZodiacFromBirthday', () => {
  it('十二个换档边界逐日钉住', () => {
    expect(derive.deriveZodiacFromBirthday('1995-01-19')).toBe('摩羯座')
    expect(derive.deriveZodiacFromBirthday('1995-01-20')).toBe('水瓶座')
    expect(derive.deriveZodiacFromBirthday('1995-02-18')).toBe('水瓶座')
    expect(derive.deriveZodiacFromBirthday('1995-02-19')).toBe('双鱼座')
    expect(derive.deriveZodiacFromBirthday('1995-03-21')).toBe('白羊座')
    expect(derive.deriveZodiacFromBirthday('1995-06-21')).toBe('双子座')
    expect(derive.deriveZodiacFromBirthday('1995-06-22')).toBe('巨蟹座')
    expect(derive.deriveZodiacFromBirthday('1995-11-22')).toBe('天蝎座')
    expect(derive.deriveZodiacFromBirthday('1995-11-23')).toBe('射手座')
    expect(derive.deriveZodiacFromBirthday('1995-12-21')).toBe('射手座')
    expect(derive.deriveZodiacFromBirthday('1995-12-22')).toBe('摩羯座')
  })

  it('星座名带"座"，与表单选项串逐字一致', () => {
    const options =
      '白羊座,金牛座,双子座,巨蟹座,狮子座,处女座,天秤座,天蝎座,射手座,摩羯座,水瓶座,双鱼座'
    for (const d of [
      '01-05',
      '02-05',
      '03-25',
      '04-25',
      '05-25',
      '06-25',
      '07-25',
      '08-25',
      '09-25',
      '10-25',
      '11-25',
      '12-25',
    ]) {
      expect(options.split(',')).toContain(derive.deriveZodiacFromBirthday(`1995-${d}`))
    }
  })

  it('只到月份时不硬给：1995-06 横跨双子与巨蟹', () => {
    expect(derive.deriveZodiacFromBirthday('1995-06')).toBe('')
    expect(derive.deriveZodiacFromBirthday('1995')).toBe('')
    expect(derive.deriveZodiacFromBirthday('06-22')).toBe('巨蟹座')
  })
})

describe('deriveMarriageFromRelationshipStatus', () => {
  it('离异/丧偶/已婚原样带过，单身系落未婚；不想透露与未知值不产出', () => {
    expect(derive.deriveMarriageFromRelationshipStatus('离异')).toBe('离异')
    expect(derive.deriveMarriageFromRelationshipStatus('丧偶')).toBe('丧偶')
    expect(derive.deriveMarriageFromRelationshipStatus('已婚')).toBe('已婚')
    for (const s of ['单身', '暧昧中', '恋爱中']) {
      expect(derive.deriveMarriageFromRelationshipStatus(s)).toBe('未婚')
    }
    for (const s of ['不想透露', '未知写法']) {
      expect(derive.deriveMarriageFromRelationshipStatus(s)).toBe('')
    }
    expect(derive.deriveMarriageFromRelationshipStatus('')).toBe('')
  })
})

describe('deriveInterestTags', () => {
  it('等于兴趣爱好 + 运动爱好的并集，顺序按兴趣在前且去重', () => {
    expect(derive.deriveInterestTags('动漫,游戏', '跑步,游泳')).toBe('动漫,游戏,跑步,游泳')
    expect(derive.deriveInterestTags('动漫,跑步', '跑步,游泳')).toBe('动漫,跑步,游泳')
    expect(derive.deriveInterestTags(' 动漫 , ', ' 游泳')).toBe('动漫,游泳')
    expect(derive.deriveInterestTags('', '')).toBe('')
    expect(derive.deriveInterestTags(null, '游泳')).toBe('游泳')
  })
})

describe('deriveProfileFields', () => {
  it('算得出来才覆盖，算不出来保留提交上来的原值', () => {
    const withSource = derive.deriveProfileFields(
      {
        birthday: '1995-06-22',
        relationship_status: '单身',
        hobbies: '动漫',
        sport: '游泳',
        age: '99',
        zodiac: '天秤座',
        marriage: '离异',
        interestTags: '旧值',
      },
      NOW,
    )
    expect(withSource.age).toBe('31')
    expect(withSource.zodiac).toBe('巨蟹座')
    expect(withSource.marriage).toBe('未婚')
    expect(withSource.interestTags).toBe('动漫,游泳')

    const withoutSource = derive.deriveProfileFields(
      { age: '30', zodiac: '白羊座', marriage: '丧偶', interestTags: '钓鱼' },
      NOW,
    )
    expect(withoutSource.age).toBe('30')
    expect(withoutSource.zodiac).toBe('白羊座')
    expect(withoutSource.marriage).toBe('丧偶')
    expect(withoutSource.interestTags).toBe('钓鱼')
  })

  it('不碰其它键，也不改动传入对象', () => {
    const input = { name: '小满', city: '西安', birthday: '1995-06-22', extra: '保持' }
    const out = derive.deriveProfileFields(input, NOW)
    expect(out.name).toBe('小满')
    expect(out.city).toBe('西安')
    expect(out.extra).toBe('保持')
    expect(input).not.toHaveProperty('age')
    expect(Object.keys(input)).toEqual(['name', 'city', 'birthday', 'extra'])
  })

  it('空对象与 undefined 都不抛', () => {
    expect(() => derive.deriveProfileFields({}, NOW)).not.toThrow()
    expect(() =>
      derive.deriveProfileFields(undefined as unknown as Record<string, unknown>, NOW),
    ).not.toThrow()
  })
})
