/** Ombak data model. Everything the app stores lives under these types. */

export type Tariff = 1 | 2 | 3
export type ThemeChoice = 'auto' | 'light' | 'dark'

/** A production / client / job you work for, each with its own day rates. */
export interface Production {
  id: string
  name: string
  company: string
  address: string
  role: string
  /** Day rates for the three tariff steps. Tariff 1 is the default. */
  rates: [number, number, number]
  /** Accent colour used in charts and the timeline. */
  color: string
  archived: boolean
  /** When the job runs. Either end is optional for open-ended work. */
  startsOn: string | null
  endsOn: string | null
  /** Free note: contact, call sheet link, anything. */
  note: string
}

/** One calendar day. A day exists in storage only once you touch it. */
export interface WorkDay {
  /** ISO date, YYYY-MM-DD. Also the primary key. */
  date: string
  productionId: string | null
  /** Was this a paid work day? A day with hours but worked=false is unpaid. */
  worked: boolean
  /** Pencilled in for a future job — counted as forecast, not as earnings. */
  booked: boolean
  tariff: Tariff
  /** Clock time HH:MM. `end` may be earlier than `start`, meaning it ran past midnight. */
  start: string | null
  end: string | null
  /** Bill a shortened day at a reduced fraction of the day rate. */
  partialDay: boolean

  // -- Meals & breaks (all in hours) --
  breakfastSkipped: boolean
  lunchLateH: number
  thirdMealLateH: number
  mealsShortH: number

  // -- Travel rings: 0 = none, 1..7 = ring number --
  ringOut: number
  ringBack: number

  /** Free amount added to (or subtracted from) the day. */
  misc: number
  /** Manual override of the rest-day-premium start time on a rest-day eve. */
  restDayStartsAt: string | null

  note: string
  tags: string[]
}

export type ExpenseCategory =
  | 'travel' | 'food' | 'gear' | 'phone' | 'rent' | 'health'
  | 'fun' | 'family' | 'tax' | 'other'

export interface Expense {
  id: string
  date: string
  amount: number
  category: ExpenseCategory
  note: string
  productionId: string | null
  /** Marks it as a work cost you can claim back, rather than personal spending. */
  billable: boolean
}

export type PaymentStatus = 'expected' | 'invoiced' | 'paid'

/** Money actually owed to you / landed in your account, per production per month. */
export interface Payment {
  id: string
  /** Month key, YYYY-MM — the month the work was done. */
  month: string
  productionId: string | null
  amount: number
  status: PaymentStatus
  /** Date it was invoiced or paid. */
  date: string
  invoiceNumber: string
  note: string
}

/** A shift that is running right now. */
export interface ActiveShift {
  date: string
  startedAt: number
  productionId: string | null
  tariff: Tariff
}

export interface Settings {
  currency: string
  currencyCode: string
  /** Hours covered by the day rate on a normal day. */
  regularDayHours: number
  /** Hours covered by the day rate on a rest-day eve (a short day). */
  eveDayHours: number
  /** Overtime multiplier for the hours between the day quota and hour 12. */
  overtimeFirstMultiplier: number
  /** How much the multiplier climbs for each hour past 13. */
  overtimeStep: number
  /** Rest-day work pays this multiple of the day rate. */
  restDayMultiplier: number
  /** Rest-day eve pays this multiple, if you worked the whole week before it. */
  eveDayBonusMultiplier: number

  weeklyQuotaHours: number
  minTurnaroundHours: number
  weekendRestShortHours: number
  weekendRestLongHours: number

  nightStart: string
  nightEnd: string
  /** Night premium as a fraction of the hourly rate. */
  nightRate: number
  /** Default clock time the rest-day premium kicks in on a rest-day eve. */
  restDayStartsAt: string

  /** Fee paid per travel ring, index 0 = ring 1. */
  ringFees: number[]

  vatRate: number
  /** Fraction of income you park for income tax. */
  taxSetAside: number
  chargeVat: boolean

  /** 0 = Sunday. The day the work week starts. */
  weekStartsOn: number
  /** 0 = Sunday .. 6 = Saturday. */
  restDay: number
  eveDay: number

  monthlyGoal: number
  theme: ThemeChoice
  defaultProductionId: string | null
  /** Personal details printed on invoices. */
  me: { name: string; role: string; businessId: string; address: string; phone: string; email: string; bank: string }
  invoiceCounter: number
}

export interface AppData {
  version: number
  settings: Settings
  productions: Production[]
  days: Record<string, WorkDay>
  expenses: Expense[]
  payments: Payment[]
  activeShift: ActiveShift | null
}
