import type { AppData } from '../types'
import { computeRange } from './pay'
import { daysInMonth, formatHM } from './time'

function esc(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One row per day of the month, with every money column broken out. */
export function monthToCSV(month: string, data: AppData): string {
  const dates = daysInMonth(month)
  const pay = computeRange(dates[0], dates[dates.length - 1], data)
  const productions = new Map(data.productions.map((p) => [p.id, p.name]))

  const header = [
    'Date', 'Production', 'Worked', 'Start', 'End', 'Hours', 'Quota', 'Overtime hours',
    'Day rate', 'Overtime', 'Night', 'Meals', 'Travel', 'Turnaround', 'Rest-day hours',
    'Weekly overage', 'Weekend rest', 'Misc', 'Extras', 'Day total', 'Where', 'Coordinates', 'Note',
  ]
  const rows = dates.map((date) => {
    const d = data.days[date]
    const p = pay.get(date)!
    return [
      date,
      d?.productionId ? productions.get(d.productionId) ?? '' : '',
      p.worked ? 'yes' : 'no',
      d?.start ?? '', d?.end ?? '',
      p.hours ? formatHM(p.hours) : '',
      p.worked ? formatHM(p.quota) : '',
      p.overtimeHours ? formatHM(p.overtimeHours) : '',
      round(p.dayFee), round(p.overtimePay), round(p.nightPay), round(p.mealPay),
      round(p.ringPay), round(p.turnaroundPay), round(p.restDayPay),
      round(p.weeklyOveragePay), round(p.weekendRestPay), round(p.misc),
      round(p.extras), round(p.total),
      d?.place?.name ?? '',
      d?.place && d.place.lat !== null && d.place.lng !== null ? `${d.place.lat},${d.place.lng}` : '',
      d?.note ?? '',
    ].map(esc).join(',')
  })
  return [header.join(','), ...rows].join('\n')
}

export function expensesToCSV(data: AppData): string {
  const header = ['Date', 'Category', 'Amount', 'Billable', 'Production', 'Note']
  const productions = new Map(data.productions.map((p) => [p.id, p.name]))
  const rows = [...data.expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [
      e.date, e.category, round(e.amount), e.billable ? 'yes' : 'no',
      e.productionId ? productions.get(e.productionId) ?? '' : '', e.note,
    ].map(esc).join(','))
  return [header.join(','), ...rows].join('\n')
}

function round(n: number): number {
  return Math.round((n || 0) * 100) / 100
}
