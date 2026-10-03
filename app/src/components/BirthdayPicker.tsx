/**
 * 「出生年月」选择器：年 / 月 / 日三个下拉，先选年才能选月，先选月才能选日（日可不填）。
 * 只选到年写 YYYY、选到月写 YYYY-MM、选到日写 YYYY-MM-DD —— 后端 profile-derive 按这三种格式派生年龄，
 * 而星座必须带日才算得出（只到月的那一档跨两个星座，硬给一个反而错）。
 */
import { useMemo } from 'react'

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_START = 1950

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** 宽松解析：接受 1995、2000-1-1、2000-01、2000/01/05，解析不出年份就整体留空。 */
export function splitBirthday(raw: unknown): { year: string; month: string; day: string } {
  const m = String(raw ?? '')
    .trim()
    .match(/^(\d{4})(?:\s*[-/年.]\s*(\d{1,2})(?:\s*[-/月.]\s*(\d{1,2}))?)?/)
  if (!m) return { year: '', month: '', day: '' }
  const year = Number(m[1])
  const month = m[2] ? Number(m[2]) : 0
  const day = m[3] ? Number(m[3]) : 0
  if (year < YEAR_START || year > CURRENT_YEAR) return { year: '', month: '', day: '' }
  if (month !== 0 && (month < 1 || month > 12)) return { year: String(year), month: '', day: '' }
  if (day !== 0 && (day < 1 || day > 31)) return { year: String(year), month: pad(month), day: '' }
  return { year: String(year), month: month ? pad(month) : '', day: day ? pad(day) : '' }
}

/** 逐级放宽：只选到年就写 YYYY，选了月写 YYYY-MM，选了日写 YYYY-MM-DD；年没选就是没填。 */
export function joinBirthday(year: string, month: string, day: string) {
  if (!year) return ''
  if (!month) return year
  if (!day) return `${year}-${month}`
  return `${year}-${month}-${day}`
}

const selectStyle = {
  background: 'var(--color-bg-input)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
  outline: 'none',
} as const

function OptionSelect({
  value,
  placeholder,
  options,
  disabled,
  onChange,
}: {
  value: string
  placeholder: string
  options: string[]
  disabled?: boolean
  onChange: (v: string) => void
}) {
  return (
    <select
      className="flex-1 min-w-0 px-3 py-2.5 rounded-lg text-sm appearance-none disabled:opacity-50"
      style={selectStyle}
      value={value}
      disabled={disabled}
      title={disabled ? '请先选上一级' : undefined}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" style={{ background: 'var(--color-bg-card)' }}>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o} value={o} style={{ background: 'var(--color-bg-card)' }}>
          {o}
        </option>
      ))}
    </select>
  )
}

export default function BirthdayPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: unknown
  onChange: (v: string) => void
}) {
  const parts = splitBirthday(value)
  const years = useMemo(
    () => Array.from({ length: CURRENT_YEAR - YEAR_START + 1 }, (_, i) => String(CURRENT_YEAR - i)),
    [],
  )
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => pad(i + 1)), [])
  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => pad(i + 1)), [])

  const emit = (next: { year: string; month: string; day: string }) =>
    onChange(joinBirthday(next.year, next.month, next.day))

  return (
    <div>
      <label className="text-xs mb-1.5 block" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </label>
      <div className="flex gap-2">
        <OptionSelect
          value={parts.year}
          placeholder="年"
          options={years}
          onChange={(v) => emit({ year: v, month: parts.month, day: parts.day })}
        />
        <OptionSelect
          value={parts.month}
          placeholder="月"
          options={months}
          disabled={!parts.year}
          onChange={(v) => emit({ year: parts.year, month: v, day: parts.day })}
        />
        <OptionSelect
          value={parts.day}
          placeholder="日(可不填)"
          options={days}
          disabled={!parts.month}
          onChange={(v) => emit({ year: parts.year, month: parts.month, day: v })}
        />
      </div>
    </div>
  )
}
