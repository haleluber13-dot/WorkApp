/** Date and clock helpers. Dates are ISO strings (YYYY-MM-DD), times are HH:MM. */

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Local-midnight Date for an ISO date string, free of timezone drift. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return toISO(new Date())
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function dayOfWeek(iso: string): number {
  return parseDate(iso).getDay()
}

/** Month key, YYYY-MM. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function daysInMonth(key: string): string[] {
  const [y, m] = key.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return Array.from({ length: last }, (_, i) => `${key}-${String(i + 1).padStart(2, '0')}`)
}

/** First day of the week containing `iso`, given a week-start weekday. */
export function startOfWeek(iso: string, weekStartsOn: number): string {
  const dow = dayOfWeek(iso)
  const back = (dow - weekStartsOn + 7) % 7
  return addDays(iso, -back)
}

export function weekDays(startISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startISO, i))
}

/** "HH:MM" -> hours as a number. Accepts "24:00". Returns null for blanks. */
export function parseTime(t: string | null | undefined): number | null {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 24 || min > 59) return null
  return h + min / 60
}

/** Hours as a number -> "HH:MM", wrapping past 24h back into clock time. */
export function formatClock(hours: number): string {
  const wrapped = ((hours % 24) + 24) % 24
  let h = Math.floor(wrapped + 1e-9)
  let m = Math.round((wrapped - h) * 60)
  if (m === 60) { m = 0; h += 1 }
  return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** A duration in hours -> "7h 45m". */
export function formatDuration(hours: number): string {
  if (!hours || hours <= 0) return '0h'
  const total = Math.round(hours * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** A duration in hours -> "07:45", the way a timesheet writes it. */
export function formatHM(hours: number): string {
  const neg = hours < 0
  const total = Math.round(Math.abs(hours) * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${neg ? '-' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Length of a shift in hours. An end at or before the start means the shift
 * ran past midnight, so it lands on the following day.
 */
export function shiftLength(start: number, end: number): number {
  return end <= start ? end + 24 - start : end - start
}

/** The end of a shift expressed in hours from the start day's midnight (may exceed 24). */
export function absoluteEnd(start: number, end: number): number {
  return end <= start ? end + 24 : end
}

export function prettyDate(iso: string): string {
  const d = parseDate(iso)
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`
}

export function prettyDateLong(iso: string): string {
  const d = parseDate(iso)
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

export function isToday(iso: string): boolean {
  return iso === todayISO()
}
