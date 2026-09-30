import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../api/config'

export interface PublicPricing {
  deposit_amount: number
  contact_unlock_amount: number
}

// 兜底值只在接口不可用时顶一下展示；真实标价以后台「价格设置」写入的 admin_settings 为准，
// 服务端下单/入账也只看那张表，前端传来的数字一律不被采信。
const FALLBACK: PublicPricing = {
  deposit_amount: 29.9,
  contact_unlock_amount: 9.9,
}

let cached: PublicPricing | null = null
let pending: Promise<PublicPricing> | null = null

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && value > 0 ? value : fallback
}

export function getCachedPricing(): PublicPricing {
  return cached ?? FALLBACK
}

export function fetchPricing(): Promise<PublicPricing> {
  if (cached) return Promise.resolve(cached)
  if (!pending) {
    pending = fetch(`${API_BASE_URL}/payment/config`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body: { data?: Partial<PublicPricing> }) => {
        const next = { ...FALLBACK }
        for (const key of Object.keys(FALLBACK) as (keyof PublicPricing)[]) {
          next[key] = pickNumber(body?.data?.[key], FALLBACK[key])
        }
        cached = next
        return cached
      })
      .catch(() => FALLBACK)
      .finally(() => {
        pending = null
      })
  }
  return pending
}

export function usePricing(): PublicPricing {
  const [pricing, setPricing] = useState<PublicPricing>(getCachedPricing)
  useEffect(() => {
    let alive = true
    fetchPricing().then((p) => {
      if (alive) setPricing(p)
    })
    return () => {
      alive = false
    }
  }, [])
  return pricing
}
