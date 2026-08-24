import type { Settings } from '../types'

export function money(amount: number, settings: Settings, opts: { decimals?: number; sign?: boolean } = {}): string {
  const decimals = opts.decimals ?? (Math.abs(amount) >= 1000 ? 0 : 2)
  const rounded = Math.round(amount * 100) / 100
  const abs = Math.abs(rounded)
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const sign = rounded < 0 ? '-' : opts.sign && rounded > 0 ? '+' : ''
  return `${sign}${settings.currency}${body}`
}

/** Compact form for tight spots: ₪27.1k */
export function moneyShort(amount: number, settings: Settings): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${settings.currency}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1000) return `${sign}${settings.currency}${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`
  return `${sign}${settings.currency}${Math.round(abs)}`
}

export function percent(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
