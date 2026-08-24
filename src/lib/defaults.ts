import type { AppData, Production, Settings } from '../types'
import { uid } from './id'

/** Bali-ish accents used to colour-code productions. */
export const PRODUCTION_COLORS = [
  '#2ec4b6', '#ff7a59', '#ffd166', '#5aa9e6', '#8ac926',
  '#f4978e', '#9d8df1', '#00b4a6', '#ff9f1c', '#4ecdc4',
]

export function defaultProduction(): Production {
  return {
    id: uid(),
    name: 'My Production',
    company: '',
    address: '',
    role: '',
    rates: [900, 1575, 2100],
    color: PRODUCTION_COLORS[0],
    archived: false,
    startsOn: null,
    endsOn: null,
    note: '',
  }
}

export function defaultSettings(): Settings {
  return {
    currency: '₪',
    currencyCode: 'ILS',
    regularDayHours: 10.5,
    eveDayHours: 9,
    overtimeFirstMultiplier: 1.5,
    overtimeStep: 0.5,
    restDayMultiplier: 2,
    eveDayBonusMultiplier: 1.2,

    weeklyQuotaHours: 60,
    minTurnaroundHours: 11,
    weekendRestShortHours: 48,
    weekendRestLongHours: 55,

    nightStart: '22:00',
    nightEnd: '05:00',
    nightRate: 0.2,
    restDayStartsAt: '18:00',

    ringFees: [0, 0, 0, 0, 0, 0, 0],

    vatRate: 0.18,
    taxSetAside: 0.25,
    chargeVat: true,

    weekStartsOn: 0,
    restDay: 6,
    eveDay: 5,

    monthlyGoal: 20000,
    theme: 'auto',
    defaultProductionId: null,
    me: { name: '', role: '', businessId: '', address: '', phone: '', email: '', bank: '' },
    invoiceCounter: 1,
  }
}

export function defaultData(): AppData {
  const production = defaultProduction()
  const settings = defaultSettings()
  settings.defaultProductionId = production.id
  return {
    version: 1,
    settings,
    productions: [production],
    days: {},
    expenses: [],
    payments: [],
    activeShift: null,
  }
}
