/**
 * 支付回调入账门槛的单测
 *
 * 后端没装自己的 runner（vitest 只在 app 里配了一套），而这段判定是刻意做成零依赖纯函数的，
 * 就用 createRequire 直接把后端源文件拉过来测，省得为了测后端再引一套依赖。
 */
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'

type ScreenResult = { ok: true } | { ok: false; reason: string; log: Record<string, string> }

interface PaymentVerify {
  yuanToFen: (yuan: unknown) => number
  isPaidAmountTrusted: (notifyTotal: unknown, orderAmount: unknown) => boolean
  isNotifyAddressedToUs: (payload: unknown, config: unknown) => boolean
  isTradeSuccess: (payload: unknown) => boolean
  safeLogValue: (value: unknown) => string
  screenWechatNotify: (input: {
    payload: Record<string, unknown> | null
    order: Record<string, unknown> | null
    config: Record<string, unknown> | null
  }) => ScreenResult
}

const nodeRequire = createRequire(import.meta.url)
const verify = nodeRequire('../../../backend/utils/payment-verify.js') as unknown as PaymentVerify

const CONFIG = { appId: 'wx0000000000000001', mchId: '1600000001' }
const OK_PAYLOAD = {
  appid: 'wx0000000000000001',
  mchid: '1600000001',
  out_trade_no: 'PAY-test',
  trade_state: 'SUCCESS',
  amount: { total: 2990, currency: 'CNY' },
}
const OK_ORDER = { amount: '29.90' } // pg 的 NUMERIC 就是这样的字符串

const screen = (
  payload: Record<string, unknown> | null,
  order: Record<string, unknown> | null = OK_ORDER,
) => verify.screenWechatNotify({ payload, order, config: CONFIG })

describe('yuanToFen', () => {
  it('元转分不受浮点表示影响', () => {
    expect(verify.yuanToFen(29.9)).toBe(2990)
    expect(verify.yuanToFen(0.1)).toBe(10)
  })

  it('兼容 pg 回传的 NUMERIC 字符串', () => {
    expect(verify.yuanToFen('29.90')).toBe(2990)
    expect(verify.yuanToFen(' 9.9 ')).toBe(990)
  })

  it('脏值一律折算失败', () => {
    expect(verify.yuanToFen(null)).toBeNaN()
    expect(verify.yuanToFen('')).toBeNaN()
    expect(verify.yuanToFen('abc')).toBeNaN()
    expect(verify.yuanToFen(29.999)).toBeNaN()
    expect(verify.yuanToFen(NaN)).toBeNaN()
  })
})

describe('isPaidAmountTrusted', () => {
  it('相等：可信', () => {
    expect(verify.isPaidAmountTrusted(2990, 29.9)).toBe(true)
  })

  it('少 1 分：不可信', () => {
    expect(verify.isPaidAmountTrusted(2989, 29.9)).toBe(false)
  })

  it('多 1 分：不可信', () => {
    expect(verify.isPaidAmountTrusted(2991, 29.9)).toBe(false)
  })

  it('null：不可信', () => {
    expect(verify.isPaidAmountTrusted(null, 29.9)).toBe(false)
  })

  it('字符串 "100"：不可信（真实微信报文里 amount.total 恒为整数）', () => {
    expect(verify.isPaidAmountTrusted('100', 1)).toBe(false)
    expect(verify.isPaidAmountTrusted('100', '1.00')).toBe(false)
  })

  it('NaN / 小数 / undefined：不可信', () => {
    expect(verify.isPaidAmountTrusted(NaN, 29.9)).toBe(false)
    expect(verify.isPaidAmountTrusted(2990.5, 29.9)).toBe(false)
    expect(verify.isPaidAmountTrusted(undefined, 29.9)).toBe(false)
  })

  it('0 分与负数：不可信（0 元单不该被当成已付）', () => {
    expect(verify.isPaidAmountTrusted(0, 0)).toBe(false)
    expect(verify.isPaidAmountTrusted(-2990, -29.9)).toBe(false)
  })

  it('订单侧脏值：不可信', () => {
    expect(verify.isPaidAmountTrusted(2990, null)).toBe(false)
    expect(verify.isPaidAmountTrusted(2990, 'x')).toBe(false)
  })
})

describe('isNotifyAddressedToUs', () => {
  it('appid 与 mchid 都一致才可信', () => {
    expect(verify.isNotifyAddressedToUs(OK_PAYLOAD, CONFIG)).toBe(true)
  })

  it('mchid 不符：不可信', () => {
    expect(verify.isNotifyAddressedToUs({ ...OK_PAYLOAD, mchid: '1600000002' }, CONFIG)).toBe(false)
  })

  it('appid 不符：不可信', () => {
    expect(
      verify.isNotifyAddressedToUs({ ...OK_PAYLOAD, appid: 'wx0000000000000002' }, CONFIG),
    ).toBe(false)
  })

  it('本站没配 appid/mchid：判为不可信（配置不全根本下不了单，没有误伤路径）', () => {
    expect(verify.isNotifyAddressedToUs(OK_PAYLOAD, { appId: '', mchId: '' })).toBe(false)
    expect(verify.isNotifyAddressedToUs(OK_PAYLOAD, {})).toBe(false)
  })
})

describe('screenWechatNotify', () => {
  it('正常通知放行', () => {
    expect(screen(OK_PAYLOAD)).toEqual({ ok: true })
  })

  it('金额少 1 分：拒绝并给出原因', () => {
    const result = screen({ ...OK_PAYLOAD, amount: { total: 2989, currency: 'CNY' } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('金额')
  })

  it('交易状态非 SUCCESS：拒绝', () => {
    const result = screen({ ...OK_PAYLOAD, trade_state: 'REFUND' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('SUCCESS')
  })

  it('mchid 不符：拒绝', () => {
    const result = screen({ ...OK_PAYLOAD, mchid: '1900000001' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('mchid')
  })

  it('通知为 null：拒绝而不是抛异常', () => {
    expect(screen(null).ok).toBe(false)
  })

  it('订单金额缺失：拒绝', () => {
    expect(screen(OK_PAYLOAD, { amount: null }).ok).toBe(false)
  })

  it('日志字段只留白名单，不带密文与签名串', () => {
    const result = screen({
      ...OK_PAYLOAD,
      amount: { total: 123, currency: 'CNY' },
      ciphertext: 'SHOULD-NOT-APPEAR',
      signature: 'SIG-SHOULD-NOT-APPEAR',
      resource: { original_type: 'encrypt-resource', key: 'APIv3-KEY-SHOULD-NOT-APPEAR' },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.log).toEqual({
      orderId: 'PAY-test',
      notifyFen: '123',
      expectFen: '2990',
      notifyAppid: 'wx0000000000000001',
      notifyMchid: '1600000001',
    })
    const dumped = JSON.stringify(result)
    expect(dumped).not.toContain('SHOULD-NOT-APPEAR')
    expect(dumped).not.toContain('SIG-SHOULD-NOT-APPEAR')
    expect(dumped).not.toContain('APIv3-KEY-SHOULD-NOT-APPEAR')
  })
})

describe('safeLogValue', () => {
  it('对象、超长与带换行的字符串都被压成安全短文本', () => {
    expect(verify.safeLogValue({ a: 1 })).toBe('[不支持的类型]')
    expect(verify.safeLogValue('a\r\nb')).toBe('ab')
    expect(verify.safeLogValue('x'.repeat(100))).toHaveLength(64)
    expect(verify.safeLogValue(null)).toBe('null')
  })
})
