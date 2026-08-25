import test from 'node:test'
import assert from 'node:assert/strict'
import { computeRange, overtimePay, turnaroundUnits, nightHoursOf, weeklyOverageUnits } from '../src/lib/pay'
import { absoluteEnd, shiftLength } from '../src/lib/time'
import { defaultSettings, defaultProduction } from '../src/lib/defaults'
import { blankDay } from '../src/lib/pay'
import type { AppData, WorkDay } from '../src/types'

const settings = { ...defaultSettings(), restDayStartsAt: '' }
const production = { ...defaultProduction(), id: 'p1', rates: [900, 1575, 2100] as [number, number, number] }
const HOURLY = 900 / 10.5 // 85.714285...

/** July 2026 sheet: date -> [start, end] for every shoot day. */
const JULY: Record<string, [string, string]> = {
  '2026-07-01': ['15:00', '24:00'],
  '2026-07-05': ['16:30', '17:45'],
  '2026-07-06': ['06:00', '17:45'],
  '2026-07-07': ['13:00', '00:15'],
  '2026-07-09': ['15:00', '04:00'],
  '2026-07-12': ['08:30', '22:45'],
  '2026-07-13': ['03:00', '03:45'],
  '2026-07-14': ['15:30', '07:45'],
  '2026-07-16': ['06:30', '22:00'],
  '2026-07-19': ['04:45', '19:00'],
  '2026-07-20': ['09:30', '15:00'],
  '2026-07-21': ['13:00', '02:45'],
  '2026-07-22': ['11:30', '00:45'],
  '2026-07-23': ['15:30', '17:30'],
  '2026-07-26': ['09:00', '12:00'],
  '2026-07-29': ['16:00', '15:00'],
}

function buildData(): AppData {
  const days: Record<string, WorkDay> = {}
  for (const [date, [start, end]] of Object.entries(JULY)) {
    days[date] = { ...blankDay(date, 'p1'), worked: true, start, end }
  }
  return {
    version: 1, settings, productions: [production], days,
    expenses: [], payments: [], activeShift: null,
  }
}

const near = (a: number, b: number, msg: string, eps = 0.01) =>
  assert.ok(Math.abs(a - b) < eps, `${msg}: got ${a}, expected ${b}`)

test('overtime ladder matches the sheet', () => {
  // 1:15 of overtime on a 10.5h day -> 1.875 hourly units
  near(overtimePay(1.25, 10.5, HOURLY, settings), 160.714285, '1h15 OT')
  near(overtimePay(0.75, 10.5, HOURLY, settings), 96.428571, '0h45 OT')
  // Past hour 13 the ladder starts at 2.5x and climbs 0.5x per hour.
  near(overtimePay(2.5, 10.5, HOURLY, settings), 364.285714, '2h30 OT')
  near(overtimePay(3.75, 10.5, HOURLY, settings), 642.857142, '3h45 OT')
  near(overtimePay(5.75, 10.5, HOURLY, settings), 1221.428571, '5h45 OT')
  near(overtimePay(5, 10.5, HOURLY, settings), 985.714285, '5h OT')
  near(overtimePay(3.25, 10.5, HOURLY, settings), 524.999999, '3h15 OT')
  near(overtimePay(2.75, 10.5, HOURLY, settings), 417.857142, '2h45 OT')
  near(overtimePay(12.5, 10.5, HOURLY, settings), 4435.714285, '12h30 OT')
})

test('shift length handles midnight and mis-taps', () => {
  near(shiftLength(15, 24), 9, '15:00 to midnight')      // entered as 24:00
  near(shiftLength(15, 0), 9, '15:00 to 00:00')          // same shift from a time input
  near(shiftLength(16, 15), 23, '16:00 to 15:00 next day')
  near(shiftLength(9, 17.5), 8.5, 'a plain day')
  // Start and stop in the same minute is zero hours, not a full day.
  near(shiftLength(15, 15), 0, 'start equals end')
  near(absoluteEnd(15, 15), 15, 'absolute end when start equals end')
  near(absoluteEnd(16, 15), 39, 'absolute end across midnight')
})

test('night premium is 20% of hourly per night hour', () => {
  near(nightHoursOf(15, 24, settings), 2, 'night hours 15:00-24:00')
  near(nightHoursOf(15.5, 31.75, settings), 9.75, 'night hours across midnight')
  near(nightHoursOf(3, 3.75, settings), 0.75, 'early-morning start')
  near(nightHoursOf(16, 39, settings), 17, '23h shift')
})

test('turnaround ladder matches the sheet', () => {
  near(turnaroundUnits(6.75), 20, '6h45 shortfall')
  near(turnaroundUnits(2.25), 2.625, '2h15 shortfall')
})

test('weekly overage ladder', () => {
  near(weeklyOverageUnits(60, 60), 0, 'at quota')
  near(weeklyOverageUnits(62, 60), 1, '2h over')
  near(weeklyOverageUnits(67, 60), 4.5, '7h over')
  near(weeklyOverageUnits(72, 60), 10.5, '12h over')
  near(weeklyOverageUnits(80, 60), 30, '20h over')
})

test('July 2026 reproduces the spreadsheet day by day', () => {
  const pay = computeRange('2026-07-01', '2026-07-31', buildData())
  const expected: Record<string, { total: number; ot?: number; extras?: number }> = {
    '2026-07-01': { total: 934.285714, ot: 0, extras: 34.285714 },
    '2026-07-05': { total: 900, ot: 0, extras: 0 },
    '2026-07-06': { total: 1060.714285, ot: 160.714285, extras: 0 },
    '2026-07-07': { total: 1035.0, ot: 96.428571, extras: 38.571428 },
    '2026-07-09': { total: 1367.142857, ot: 364.285714, extras: 102.857142 },
    '2026-07-12': { total: 1984.285714, ot: 642.857142, extras: 441.428571 },
    '2026-07-13': { total: 2627.142857, ot: 0, extras: 1727.142857 },
    '2026-07-14': { total: 2288.571428, ot: 1221.428571, extras: 167.142857 },
    '2026-07-16': { total: 1885.714285, ot: 985.714285, extras: 0 },
    '2026-07-19': { total: 1589.999999, ot: 642.857142, extras: 47.142857 },
    '2026-07-20': { total: 900, ot: 0, extras: 0 },
    '2026-07-21': { total: 1506.428571, ot: 524.999999, extras: 81.428571 },
    '2026-07-22': { total: 1589.999999, ot: 417.857142, extras: 272.142857 },
    '2026-07-23': { total: 900, ot: 0, extras: 0 },
    '2026-07-26': { total: 900, ot: 0, extras: 0 },
    '2026-07-29': { total: 5627.142857, ot: 4435.714285, extras: 291.428571 },
  }
  let sum = 0
  for (const [date, exp] of Object.entries(expected)) {
    const p = pay.get(date)!
    if (exp.ot !== undefined) near(p.overtimePay, exp.ot, `${date} overtime`)
    if (exp.extras !== undefined) near(p.extras, exp.extras, `${date} extras`)
    near(p.total, exp.total, `${date} total`)
    sum += p.total
  }
  near(sum, 27096.428571, 'July grand total before VAT', 0.05)
})

/**
 * A second real month, at a different day rate (950), from an independently
 * filled copy of the same calculator. Cross-checks that nothing is hard-coded
 * to the 900 rate.
 */
const JULY_950: Record<string, [string, string]> = {
  '2026-07-01': ['13:00', '02:00'], '2026-07-02': ['17:30', '06:30'], '2026-07-05': ['03:45', '15:45'],
  '2026-07-06': ['05:30', '15:00'], '2026-07-07': ['11:45', '17:45'], '2026-07-08': ['09:00', '19:45'],
  '2026-07-09': ['04:45', '16:00'], '2026-07-12': ['07:00', '22:45'], '2026-07-13': ['16:30', '03:45'],
  '2026-07-14': ['16:30', '08:00'], '2026-07-16': ['06:30', '22:15'], '2026-07-19': ['04:45', '19:30'],
  '2026-07-20': ['09:45', '14:30'], '2026-07-21': ['13:00', '03:00'], '2026-07-22': ['12:30', '00:15'],
  '2026-07-23': ['16:45', '04:45'], '2026-07-26': ['09:00', '15:00'],
}

test('a second month at a 950 day rate matches its sheet', () => {
  const days: Record<string, WorkDay> = {}
  for (const [date, [start, end]] of Object.entries(JULY_950)) {
    days[date] = { ...blankDay(date, 'p1'), worked: true, start, end }
  }
  const data: AppData = {
    version: 1, settings,
    productions: [{ ...production, rates: [950, 1663, 2217] as [number, number, number] }],
    days, expenses: [], payments: [], activeShift: null,
  }
  const pay = computeRange('2026-07-01', '2026-07-31', data)

  // Overtime column, straight off the sheet.
  const expectedOvertime: Record<string, number> = {
    '2026-07-01': 384.523809, '2026-07-02': 384.523809, '2026-07-05': 203.571428,
    '2026-07-06': 0, '2026-07-07': 0, '2026-07-08': 33.928571, '2026-07-09': 101.785714,
    '2026-07-12': 1119.642857, '2026-07-13': 101.785714, '2026-07-14': 1040.476190,
    '2026-07-16': 1119.642857, '2026-07-19': 814.285714, '2026-07-20': 0,
    '2026-07-21': 610.714285, '2026-07-22': 169.642857, '2026-07-23': 203.571428,
    '2026-07-26': 0,
  }
  for (const [date, expected] of Object.entries(expectedOvertime)) {
    near(pay.get(date)!.overtimePay, expected, `${date} overtime at 950`)
  }

  const all = [...pay.values()]
  assert.equal(all.filter((p) => p.worked).length, 17, 'shoot days')
  near(all.reduce((s, p) => s + p.dayFee, 0), 17 * 950, 'day fees (17 days x 950)')
  near(all.reduce((s, p) => s + p.overtimePay, 0), 6288.095238, 'overtime total', 0.05)
})

test('July totals split the way the sheet splits them', () => {
  const pay = computeRange('2026-07-01', '2026-07-31', buildData())
  const all = [...pay.values()]
  near(all.reduce((s, p) => s + p.dayFee, 0), 14400, 'day fees (16 days x 900)')
  near(all.reduce((s, p) => s + p.overtimePay, 0), 9492.857142, 'overtime')
  near(all.reduce((s, p) => s + p.extras, 0), 3203.571428, 'extras', 0.05)
  assert.equal(all.filter((p) => p.worked).length, 16, 'shoot days')
})
