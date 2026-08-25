/**
 * The pay engine.
 *
 * You are paid by the day, not by the hour. The day rate buys a fixed number of
 * hours (the "quota"); everything past that climbs a ladder of multipliers, and a
 * handful of separate premiums ride on top. The hourly figure used throughout is
 * derived from the day rate: hourly = dayRate / quota.
 */

import type { AppData, Production, Settings, WorkDay } from '../types'
import { absoluteEnd, addDays, dayOfWeek, parseTime, shiftLength, startOfWeek } from './time'

export interface DayPay {
  date: string
  worked: boolean
  /** Hours actually on the clock. */
  hours: number
  /** Hours the day rate already covers. */
  quota: number
  overtimeHours: number
  hourly: number

  dayFee: number
  overtimePay: number

  nightHours: number
  nightPay: number
  mealPay: number
  ringPay: number
  turnaroundGap: number
  turnaroundShortfall: number
  turnaroundPay: number
  restDayHours: number
  restDayPay: number
  weeklyOverageHours: number
  weeklyOveragePay: number
  weekendRestGap: number
  weekendRestShortfall: number
  weekendRestPay: number
  misc: number

  /** Everything that is not the day rate or plain overtime. */
  extras: number
  total: number

  /** Shift position on a 24h timeline, in hours from the day's midnight. */
  startAbs: number | null
  endAbs: number | null
  flags: DayFlag[]
}

export type DayFlag =
  | 'overtime' | 'long-day' | 'night' | 'short-turnaround'
  | 'rest-day' | 'eve-day' | 'partial' | 'over-quota'

const EMPTY_EXTRAS = {
  nightHours: 0, nightPay: 0, mealPay: 0, ringPay: 0,
  turnaroundGap: 0, turnaroundShortfall: 0, turnaroundPay: 0,
  restDayHours: 0, restDayPay: 0,
  weeklyOverageHours: 0, weeklyOveragePay: 0,
  weekendRestGap: 0, weekendRestShortfall: 0, weekendRestPay: 0,
}

export function blankDay(date: string, productionId: string | null = null): WorkDay {
  return {
    date, productionId, worked: false, booked: false, tariff: 1, start: null, end: null,
    partialDay: false, breakfastSkipped: false, lunchLateH: 0, thirdMealLateH: 0,
    mealsShortH: 0, ringOut: 0, ringBack: 0, misc: 0, restDayStartsAt: null,
    note: '', tags: [],
  }
}

export function dayRateFor(day: WorkDay, production: Production | undefined): number {
  const rates = production?.rates ?? [850, 1500, 2000]
  const base = rates[day.tariff - 1] ?? rates[0]
  return base || 0
}

/** Hours the day rate covers: a rest-day eve is a shorter day. */
export function quotaFor(date: string, settings: Settings): number {
  return dayOfWeek(date) === settings.eveDay ? settings.eveDayHours : settings.regularDayHours
}

/**
 * Overtime money for `ot` hours past the day quota.
 *
 *   quota .. 12   -> 1.5x hourly
 *   12 .. 13      -> 2x hourly
 *   13 onwards    -> 2.5x for the first hour, then +0.5x for every further hour
 */
export function overtimePay(ot: number, quota: number, hourly: number, settings: Settings): number {
  if (ot <= 0) return 0
  const firstBand = Math.max(0, 12 - quota)
  const secondBandEnd = Math.max(0, 13 - quota)

  const t1 = hourly * settings.overtimeFirstMultiplier * Math.min(ot, firstBand)
  const t2 = ot > firstBand ? hourly * 2 * Math.min(1, ot - firstBand) : 0

  const above13 = Math.max(0, ot - secondBandEnd)
  let t3 = 0
  if (above13 > 0) {
    const step = settings.overtimeStep
    const n = Math.floor(above13 + 1e-9)
    const frac = above13 - n
    t3 = hourly * (2 * n + (step * n * (n + 1)) / 2 + (2 + step * (n + 1)) * frac)
  }
  return t1 + t2 + t3
}

/** Hours of the shift that fall inside the night window. */
export function nightHoursOf(startAbs: number, endAbs: number, settings: Settings): number {
  const nStart = parseTime(settings.nightStart) ?? 22
  const nEnd = parseTime(settings.nightEnd) ?? 5
  const evening = endAbs > nStart ? (startAbs < nStart ? endAbs - nStart : endAbs - startAbs) : 0
  const morning = startAbs < nEnd ? (endAbs > nEnd ? nEnd - startAbs : endAbs - startAbs) : 0
  return Math.max(0, evening) + Math.max(0, morning)
}

/** Extra rest a travel ring buys you before the turnaround clock starts. */
export function ringRestHours(ring: number): number {
  if (ring >= 7) return 3
  if (ring >= 5) return 2
  if (ring >= 3) return 1.5
  if (ring >= 2) return 1
  return 0
}

/** Cost of cutting into the rest between two consecutive work days, in hourly units. */
export function turnaroundUnits(shortfall: number): number {
  const s = shortfall
  if (s <= 0) return 0
  if (s <= 1) return s
  if (s <= 2) return (s - 1) * 1.25 + 1
  if (s <= 3) return (s - 2) * 1.5 + 2.25
  if (s <= 4) return (s - 3) * 2.5 + 3.75
  return (s - 4) * 5 + 6.25
}

/** Cost of blowing past the weekly hour quota, in hourly units. */
export function weeklyOverageUnits(weekHours: number, quota: number): number {
  const w = weekHours
  if (w <= quota) return 0
  if (w > quota + 15) return 15 + 3 * (w - (quota + 15))
  if (w > quota + 10) return 7.5 + 1.5 * (w - (quota + 10))
  if (w > quota + 5) return 2.5 + (w - (quota + 5))
  return 0.5 * (w - quota)
}

/** A shortened day bills a fraction of the day rate. */
function partialFactor(hours: number): number {
  if (hours > 6) return 1
  if (hours > 5) return 0.7
  if (hours > 4) return 0.6
  return 0.5
}

interface Ctx {
  days: Record<string, WorkDay>
  productions: Map<string, Production>
  settings: Settings
}

function shiftOf(day: WorkDay | undefined): { start: number; end: number; length: number } | null {
  if (!day || !day.worked) return null
  const s = parseTime(day.start)
  const e = parseTime(day.end)
  if (s === null || e === null) return null
  return { start: s, end: absoluteEnd(s, e), length: shiftLength(s, e) }
}

/** Whether the previous day's shift bled over into `date`. */
function prevEndsOnSameDay(prev: { start: number; end: number }): boolean {
  return prev.end > 24
}

function computeOneDay(date: string, ctx: Ctx): DayPay {
  const { settings } = ctx
  const day = ctx.days[date]
  const dow = dayOfWeek(date)
  const quota = quotaFor(date, settings)

  const base: DayPay = {
    date, worked: false, hours: 0, quota, overtimeHours: 0, hourly: 0,
    dayFee: 0, overtimePay: 0, ...EMPTY_EXTRAS, misc: day?.misc ?? 0,
    extras: 0, total: 0, startAbs: null, endAbs: null, flags: [],
  }

  if (!day || !day.worked) {
    base.total = base.misc
    base.extras = base.misc
    return base
  }

  const production = day.productionId ? ctx.productions.get(day.productionId) : undefined
  const shift = shiftOf(day)
  const hours = shift?.length ?? 0

  // --- The day rate itself ---
  let dayRate = dayRateFor(day, production)
  const flags: DayFlag[] = []

  if (dow === settings.restDay) {
    dayRate *= settings.restDayMultiplier
    flags.push('rest-day')
  } else if (dow === settings.eveDay) {
    flags.push('eve-day')
    // The eve bonus is earned only by working every day of the week before it.
    const before = Array.from({ length: 5 }, (_, i) => ctx.days[addDays(date, -(i + 1))])
    if (before.every((d) => d?.worked)) dayRate *= settings.eveDayBonusMultiplier
  }

  const hourly = quota > 0 ? dayRate / quota : 0
  let dayFee = dayRate
  if (day.partialDay) {
    dayFee = dayRate * partialFactor(hours)
    flags.push('partial')
  }

  // --- Overtime ---
  const overtimeHours = Math.max(0, hours - quota)
  const otPay = overtimePay(overtimeHours, quota, hourly, settings)
  if (overtimeHours > 0) flags.push('overtime')
  if (hours >= 13) flags.push('long-day')

  // --- Night premium ---
  let nightHours = 0
  if (shift) nightHours = nightHoursOf(shift.start, shift.end, settings)
  const nightPay = hourly * settings.nightRate * nightHours
  if (nightHours > 0) flags.push('night')

  // --- Meals and breaks ---
  const mealUnits =
    (day.breakfastSkipped ? 0.25 : 0) +
    (day.lunchLateH > 0.5 ? day.lunchLateH : day.lunchLateH / 2) +
    day.thirdMealLateH +
    day.mealsShortH * 2
  const mealPay = hourly * mealUnits

  // --- Travel rings ---
  const ringFee = (r: number) => (r >= 1 && r <= settings.ringFees.length ? settings.ringFees[r - 1] : 0)
  const ringPay = ringFee(day.ringOut) + ringFee(day.ringBack)

  // --- Turnaround: rest between two back-to-back work days ---
  let turnaroundGap = 0
  let turnaroundShortfall = 0
  let turnaroundPay = 0
  const prevDay = ctx.days[addDays(date, -1)]
  const prevShift = shiftOf(prevDay)
  if (shift && prevShift) {
    const prevEndClock = prevShift.end % 24
    turnaroundGap = prevEndsOnSameDay(prevShift)
      ? shift.start - prevEndClock
      : 24 + shift.start - prevEndClock
    if (turnaroundGap > 0) {
      const rest = ringRestHours(Math.max(prevDay!.ringBack, day.ringOut))
      const required = settings.minTurnaroundHours + rest
      turnaroundShortfall = Math.max(0, required - turnaroundGap)
      turnaroundPay = hourly * turnaroundUnits(turnaroundShortfall)
      if (turnaroundShortfall > 0) flags.push('short-turnaround')
    }
  }

  // --- Rest-day premium hours worked on a rest-day eve ---
  let restDayHours = 0
  let restDayPay = 0
  if (dow === settings.eveDay && shift) {
    const entry = parseTime(day.restDayStartsAt ?? settings.restDayStartsAt)
    if (entry !== null && shift.end > entry) {
      if (shift.start < entry) {
        restDayHours = Math.min(shift.start + quota, shift.end) - entry
      } else {
        restDayHours = Math.min(shift.length, quota)
      }
      restDayHours = Math.max(0, restDayHours)
      restDayPay = hourly * restDayHours * settings.restDayMultiplier
    }
  }

  const extras = mealPay + ringPay + nightPay + turnaroundPay + restDayPay + (day.misc || 0)

  return {
    date, worked: true, hours, quota, overtimeHours, hourly,
    dayFee, overtimePay: otPay,
    nightHours, nightPay, mealPay, ringPay,
    turnaroundGap, turnaroundShortfall, turnaroundPay,
    restDayHours, restDayPay,
    weeklyOverageHours: 0, weeklyOveragePay: 0,
    weekendRestGap: 0, weekendRestShortfall: 0, weekendRestPay: 0,
    misc: day.misc || 0,
    extras, total: dayFee + otPay + extras,
    startAbs: shift?.start ?? null, endAbs: shift?.end ?? null,
    flags,
  }
}

/**
 * What a pencilled-in day is expected to be worth: the day rate, adjusted for
 * a rest day. Overtime and premiums are unknowable until the day is worked.
 */
export function forecastDay(day: WorkDay, production: Production | undefined, settings: Settings): number {
  if (!day.booked || day.worked) return 0
  let rate = dayRateFor(day, production)
  if (dayOfWeek(day.date) === settings.restDay) rate *= settings.restDayMultiplier
  return rate
}

/**
 * Price a continuous range of dates. Turnaround and the weekly quota look at
 * neighbouring days, so the range is padded by a week on each side internally.
 */
export function computeRange(fromISO: string, toISO: string, data: AppData): Map<string, DayPay> {
  const ctx: Ctx = {
    days: data.days,
    productions: new Map(data.productions.map((p) => [p.id, p])),
    settings: data.settings,
  }
  const { settings } = data

  const padFrom = addDays(fromISO, -9)
  const padTo = addDays(toISO, 9)

  const dates: string[] = []
  for (let d = padFrom; d <= padTo; d = addDays(d, 1)) dates.push(d)

  const result = new Map<string, DayPay>()
  for (const d of dates) result.set(d, computeOneDay(d, ctx))

  // --- Week-level charges ---
  const tier1Hourly = (() => {
    const p = data.productions.find((x) => !x.archived) ?? data.productions[0]
    const rate = p?.rates[0] ?? 900
    return settings.regularDayHours > 0 ? rate / settings.regularDayHours : 0
  })()

  const weeks = new Map<string, string[]>()
  for (const d of dates) {
    const wk = startOfWeek(d, settings.weekStartsOn)
    if (!weeks.has(wk)) weeks.set(wk, [])
    weeks.get(wk)!.push(d)
  }

  const orderedWeeks = [...weeks.keys()].sort()
  let previousWeekLastWorked: { date: string; endAbs: number } | null = null

  for (const wk of orderedWeeks) {
    const wkDates = weeks.get(wk)!
    const worked = wkDates.filter((d) => result.get(d)!.worked)

    // Weekly hour quota, charged on the last day of the week.
    const weekHours = wkDates.reduce((s, d) => s + (result.get(d)?.hours ?? 0), 0)
    const overUnits = weeklyOverageUnits(weekHours, settings.weeklyQuotaHours)
    if (overUnits > 0) {
      const anchor = worked.length ? worked[worked.length - 1] : wkDates[wkDates.length - 1]
      const p = result.get(anchor)!
      p.weeklyOverageHours = Math.max(0, weekHours - settings.weeklyQuotaHours)
      p.weeklyOveragePay = overUnits * tier1Hourly
      p.extras += p.weeklyOveragePay
      p.total += p.weeklyOveragePay
      if (!p.flags.includes('over-quota')) p.flags.push('over-quota')
    }

    // Weekend rest, charged on the first work day of the new week.
    if (worked.length && previousWeekLastWorked) {
      const first = worked[0]
      const p = result.get(first)!
      const prev = previousWeekLastWorked
      const daysBetween = Math.round(
        (new Date(first + 'T00:00:00').getTime() - new Date(prev.date + 'T00:00:00').getTime()) / 86400000,
      )
      const gap = daysBetween * 24 - prev.endAbs + (p.startAbs ?? 0)
      // Two or more clear days off means a long weekend, which demands more rest.
      const idle = daysBetween - 1
      const required = idle >= 2 ? settings.weekendRestLongHours : settings.weekendRestShortHours
      const shortfall = Math.max(0, required - gap)
      p.weekendRestGap = gap
      p.weekendRestShortfall = shortfall
      if (shortfall > 0) {
        p.weekendRestPay = shortfall * tier1Hourly * 2
        p.extras += p.weekendRestPay
        p.total += p.weekendRestPay
      }
    }

    if (worked.length) {
      const last = worked[worked.length - 1]
      previousWeekLastWorked = { date: last, endAbs: result.get(last)!.endAbs ?? 0 }
    }
  }

  // Trim the padding back off.
  const trimmed = new Map<string, DayPay>()
  for (let d = fromISO; d <= toISO; d = addDays(d, 1)) trimmed.set(d, result.get(d)!)
  return trimmed
}
