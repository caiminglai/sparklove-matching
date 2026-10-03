import { describe, it, expect } from 'vitest'
import { splitBirthday, joinBirthday } from './BirthdayPicker'

describe('splitBirthday', () => {
  it('完整年月日按补零拆开', () => {
    expect(splitBirthday('1995-06-22')).toEqual({ year: '1995', month: '06', day: '22' })
  })

  it('宽松写法都能吃：个位数、斜杠、年.月、点分隔', () => {
    expect(splitBirthday('1995-6-2')).toEqual({ year: '1995', month: '06', day: '02' })
    expect(splitBirthday('1995/06/22')).toEqual({ year: '1995', month: '06', day: '22' })
    expect(splitBirthday('1995年6月')).toEqual({ year: '1995', month: '06', day: '' })
    expect(splitBirthday('1995.6')).toEqual({ year: '1995', month: '06', day: '' })
  })

  it('只到年或只到月时下级留空', () => {
    expect(splitBirthday('1995')).toEqual({ year: '1995', month: '', day: '' })
    expect(splitBirthday('1995-06')).toEqual({ year: '1995', month: '06', day: '' })
  })

  it('没有年份时三项一起清空', () => {
    for (const raw of ['', '   ', null, undefined, '六九年', '06-22']) {
      expect(splitBirthday(raw)).toEqual({ year: '', month: '', day: '' })
    }
  })

  it('超出可选范围的值按级清掉：年越界整体清空，月/日越界只清自己', () => {
    expect(splitBirthday('2100-01')).toEqual({ year: '', month: '', day: '' })
    expect(splitBirthday('1900-05-06')).toEqual({ year: '', month: '', day: '' })
    expect(splitBirthday('1995-13-05')).toEqual({ year: '1995', month: '', day: '' })
    expect(splitBirthday('1995-06-45')).toEqual({ year: '1995', month: '06', day: '' })
  })
})

describe('joinBirthday', () => {
  it('按选到哪级写到哪级', () => {
    expect(joinBirthday('1995', '06', '22')).toBe('1995-06-22')
    expect(joinBirthday('1995', '06', '')).toBe('1995-06')
    expect(joinBirthday('1995', '', '')).toBe('1995')
  })

  it('年没选就是没填，后面选了月日也不算', () => {
    expect(joinBirthday('', '06', '22')).toBe('')
    expect(joinBirthday('', '06', '')).toBe('')
    expect(joinBirthday('1995', '', '22')).toBe('1995')
  })

  it('拆完再拼回去等于补零后的原值', () => {
    const cases: Array<[string, string]> = [
      ['1995-06-22', '1995-06-22'],
      ['1995-06', '1995-06'],
      ['1995-6-2', '1995-06-02'],
      ['1995年6月', '1995-06'],
      ['1995', '1995'],
    ]
    for (const [raw, expected] of cases) {
      const p = splitBirthday(raw)
      expect(joinBirthday(p.year, p.month, p.day)).toBe(expected)
    }
  })

  it('三个下拉从空开始逐级点下去不会互相冲掉', () => {
    let stored = ''
    const pickYear = () => {
      const p = splitBirthday(stored)
      stored = joinBirthday('1990', p.month, p.day)
    }
    const pickMonth = () => {
      const p = splitBirthday(stored)
      stored = joinBirthday(p.year, '05', p.day)
    }
    const pickDay = () => {
      const p = splitBirthday(stored)
      stored = joinBirthday(p.year, p.month, '08')
    }
    pickYear()
    expect(stored).toBe('1990')
    pickMonth()
    expect(stored).toBe('1990-05')
    pickDay()
    expect(stored).toBe('1990-05-08')
    const final = splitBirthday(stored)
    expect(final).toEqual({ year: '1990', month: '05', day: '08' })
  })
})
