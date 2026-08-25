import type { AppData, Expense, Payment, Production, WorkDay } from '../types'
import type { DayPay } from './pay'
import { computeRange, forecastDay } from './pay'
import { addDays, daysInMonth, monthKey, startOfWeek, todayISO } from './time'

export interface MonthSummary {
  month: string
  days: DayPay[]
  workedDays: number
  hours: number
  overtimeHours: number
  nightHours: number
  /** Money before VAT. */
  gross: number
  dayFees: number
  overtime: number
  extras: number
  vat: number
  /** Gross + VAT: what you actually invoice. */
  invoiceTotal: number
  /** Gross minus the slice you park for income tax. */
  afterTax: number
  taxSetAside: number
  spent: number
  billableSpent: number
  /** afterTax - personal spending. */
  net: number
  avgPerDay: number
  avgPerHour: number
  bestDay: DayPay | null
  longestDay: DayPay | null
}

export function summariseMonth(month: string, data: AppData): MonthSummary {
  const dates = daysInMonth(month)
  const pay = computeRange(dates[0], dates[dates.length - 1], data)
  const days = dates.map((d) => pay.get(d)!).filter(Boolean)
  const worked = days.filter((d) => d.worked)

  const dayFees = sum(days, (d) => d.dayFee)
  const overtime = sum(days, (d) => d.overtimePay)
  const extras = sum(days, (d) => d.extras)
  const gross = dayFees + overtime + extras
  const vat = data.settings.chargeVat ? gross * data.settings.vatRate : 0

  const monthExpenses = data.expenses.filter((e) => monthKey(e.date) === month)
  const spent = sum(monthExpenses, (e) => e.amount)
  const billableSpent = sum(monthExpenses.filter((e) => e.billable), (e) => e.amount)

  const taxSetAside = gross * data.settings.taxSetAside
  const afterTax = gross - taxSetAside
  const hours = sum(days, (d) => d.hours)

  return {
    month,
    days,
    workedDays: worked.length,
    hours,
    overtimeHours: sum(days, (d) => d.overtimeHours),
    nightHours: sum(days, (d) => d.nightHours),
    gross, dayFees, overtime, extras, vat,
    invoiceTotal: gross + vat,
    afterTax, taxSetAside,
    spent,
    billableSpent,
    net: afterTax - (spent - billableSpent),
    avgPerDay: worked.length ? gross / worked.length : 0,
    avgPerHour: hours > 0 ? gross / hours : 0,
    bestDay: worked.length ? worked.reduce((a, b) => (b.total > a.total ? b : a)) : null,
    longestDay: worked.length ? worked.reduce((a, b) => (b.hours > a.hours ? b : a)) : null,
  }
}

export interface WeekSummary {
  start: string
  days: DayPay[]
  hours: number
  gross: number
  workedDays: number
  overQuota: boolean
}

export function summariseWeek(anyDateInWeek: string, data: AppData): WeekSummary {
  const start = startOfWeek(anyDateInWeek, data.settings.weekStartsOn)
  const end = addDays(start, 6)
  const pay = computeRange(start, end, data)
  const days = [...pay.values()]
  const hours = sum(days, (d) => d.hours)
  return {
    start,
    days,
    hours,
    gross: sum(days, (d) => d.total),
    workedDays: days.filter((d) => d.worked).length,
    overQuota: hours > data.settings.weeklyQuotaHours,
  }
}

/** Rolling stats used on the dashboard: this month against the last one. */
export function trend(current: number, previous: number): { delta: number; pct: number | null } {
  const delta = current - previous
  return { delta, pct: previous > 0 ? delta / previous : null }
}

export function expensesByCategory(expenses: Expense[]): { category: string; amount: number }[] {
  const map = new Map<string, number>()
  for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount)
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
}

export interface Outstanding {
  expected: number
  invoiced: number
  paid: number
  owed: number
}

export function outstanding(payments: Payment[]): Outstanding {
  const by = (s: Payment['status']) => sum(payments.filter((p) => p.status === s), (p) => p.amount)
  const expected = by('expected')
  const invoiced = by('invoiced')
  const paid = by('paid')
  return { expected, invoiced, paid, owed: expected + invoiced }
}

/** Consecutive days worked ending today (or the last worked day). */
export function currentStreak(data: AppData): number {
  let streak = 0
  let cursor = todayISO()
  if (!data.days[cursor]?.worked) cursor = addDays(cursor, -1)
  for (let i = 0; i < 400; i++) {
    if (data.days[cursor]?.worked) { streak++; cursor = addDays(cursor, -1) } else break
  }
  return streak
}

/** Days since the last day off, used for the rest warning. */
export function daysWithoutRest(data: AppData): number {
  return currentStreak(data)
}

export function sum<T>(items: T[], pick: (item: T) => number): number {
  let total = 0
  for (const item of items) total += pick(item) || 0
  return total
}

export function monthsWithData(data: AppData): string[] {
  const keys = new Set<string>()
  for (const d of Object.keys(data.days)) if (data.days[d].worked) keys.add(monthKey(d))
  for (const e of data.expenses) keys.add(monthKey(e.date))
  keys.add(monthKey(todayISO()))
  return [...keys].sort()
}

/** Money pencilled in but not yet worked, for this month and beyond. */
export interface Forecast {
  bookedDays: number
  value: number
  nextDate: string | null
  byProduction: { productionId: string | null; days: number; value: number }[]
}

export function forecast(data: AppData, fromISO: string, toISO?: string): Forecast {
  const productions = new Map(data.productions.map((p) => [p.id, p]))
  const rows = Object.values(data.days)
    .filter((d) => d.booked && !d.worked && d.date >= fromISO && (!toISO || d.date <= toISO))
    .sort((a, b) => a.date.localeCompare(b.date))

  const grouped = new Map<string, { days: number; value: number }>()
  let value = 0
  for (const d of rows) {
    const v = forecastDay(d, d.productionId ? productions.get(d.productionId) : undefined, data.settings)
    value += v
    const key = d.productionId ?? ''
    const cur = grouped.get(key) ?? { days: 0, value: 0 }
    grouped.set(key, { days: cur.days + 1, value: cur.value + v })
  }

  return {
    bookedDays: rows.length,
    value,
    nextDate: rows[0]?.date ?? null,
    byProduction: [...grouped.entries()]
      .map(([productionId, v]) => ({ productionId: productionId || null, ...v }))
      .sort((a, b) => b.value - a.value),
  }
}

/**
 * Days you pencilled in that have since come and gone without being logged.
 * Worth surfacing — an un-logged booked day is money you may forget to bill.
 */
export function staleBookings(data: AppData, today: string): WorkDay[] {
  return Object.values(data.days)
    .filter((d) => d.booked && !d.worked && d.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Everything a single job has been worth so far, plus what is still booked. */
export interface JobSummary {
  production: Production
  workedDays: number
  bookedDays: number
  hours: number
  earned: number
  forecast: number
  firstDate: string | null
  lastDate: string | null
  paid: number
  owed: number
}

export function summariseJob(production: Production, data: AppData): JobSummary {
  const days = Object.values(data.days).filter((d) => d.productionId === production.id)
  const worked = days.filter((d) => d.worked).sort((a, b) => a.date.localeCompare(b.date))
  const booked = days.filter((d) => d.booked && !d.worked)

  let earned = 0
  let hours = 0
  if (worked.length) {
    const pay = computeRange(worked[0].date, worked[worked.length - 1].date, data)
    for (const d of worked) {
      const p = pay.get(d.date)
      if (p) { earned += p.total; hours += p.hours }
    }
  }

  const payments = data.payments.filter((p) => p.productionId === production.id)
  return {
    production,
    workedDays: worked.length,
    bookedDays: booked.length,
    hours,
    earned,
    forecast: sum(booked, (d) => forecastDay(d, production, data.settings)),
    firstDate: worked[0]?.date ?? booked[0]?.date ?? null,
    lastDate: worked[worked.length - 1]?.date ?? null,
    paid: sum(payments.filter((p) => p.status === 'paid'), (p) => p.amount),
    owed: sum(payments.filter((p) => p.status !== 'paid'), (p) => p.amount),
  }
}

export interface PlaceSummary {
  key: string
  name: string
  lat: number | null
  lng: number | null
  days: number
  hours: number
  earned: number
  firstDate: string
  lastDate: string
}

/**
 * Everywhere you have worked, busiest first. Days are grouped by place name
 * where there is one, and otherwise by a coarse coordinate cell so repeat
 * visits to the same unnamed spot collapse into one row.
 */
export function placesWorked(data: AppData): PlaceSummary[] {
  const dates = Object.values(data.days)
    .filter((d) => d.worked && d.place && (d.place.name.trim() || d.place.lat !== null))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!dates.length) return []

  const pay = computeRange(dates[0].date, dates[dates.length - 1].date, data)
  const groups = new Map<string, PlaceSummary>()

  for (const day of dates) {
    const place = day.place!
    const named = place.name.trim()
    // ~100m cells, enough to merge repeat visits without merging neighbours.
    const cell = place.lat !== null && place.lng !== null
      ? `${place.lat.toFixed(3)},${place.lng.toFixed(3)}`
      : ''
    const key = named.toLowerCase() || cell
    if (!key) continue

    const p = pay.get(day.date)
    const existing = groups.get(key)
    if (existing) {
      existing.days += 1
      existing.hours += p?.hours ?? 0
      existing.earned += p?.total ?? 0
      existing.lastDate = day.date
      if (!existing.name && named) existing.name = named
      if (existing.lat === null && place.lat !== null) { existing.lat = place.lat; existing.lng = place.lng }
    } else {
      groups.set(key, {
        key,
        name: named,
        lat: place.lat,
        lng: place.lng,
        days: 1,
        hours: p?.hours ?? 0,
        earned: p?.total ?? 0,
        firstDate: day.date,
        lastDate: day.date,
      })
    }
  }

  return [...groups.values()].sort((a, b) => b.days - a.days || b.earned - a.earned)
}
