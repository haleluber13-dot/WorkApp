import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ActiveShift, AppData, Expense, Payment, Production, Settings, WorkDay } from '../types'
import { blankDay } from '../lib/pay'
import { load, save } from '../lib/storage'
import { uid } from '../lib/id'
import { monthKey, todayISO } from '../lib/time'

interface Store {
  data: AppData
  settings: Settings
  setSettings: (patch: Partial<Settings>) => void
  getDay: (date: string) => WorkDay
  setDay: (date: string, patch: Partial<WorkDay>) => void
  clearDay: (date: string) => void
  addExpense: (e: Omit<Expense, 'id'>) => void
  updateExpense: (id: string, patch: Partial<Expense>) => void
  removeExpense: (id: string) => void
  addPayment: (p: Omit<Payment, 'id'>) => void
  updatePayment: (id: string, patch: Partial<Payment>) => void
  removePayment: (id: string) => void
  addProduction: (p: Omit<Production, 'id'>) => string
  updateProduction: (id: string, patch: Partial<Production>) => void
  removeProduction: (id: string) => void
  startShift: (productionId: string | null, tariff: 1 | 2 | 3) => void
  stopShift: () => void
  activeShift: ActiveShift | null
  replaceAll: (next: AppData) => void
  productionOf: (id: string | null) => Production | undefined
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => load())
  const first = useRef(true)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    save(data)
  }, [data])

  const store = useMemo<Store>(() => {
    const mutate = (fn: (draft: AppData) => void) =>
      setData((prev) => {
        const next: AppData = {
          ...prev,
          settings: { ...prev.settings },
          productions: [...prev.productions],
          days: { ...prev.days },
          expenses: [...prev.expenses],
          payments: [...prev.payments],
        }
        fn(next)
        return next
      })

    return {
      data,
      settings: data.settings,
      activeShift: data.activeShift,

      setSettings: (patch) => mutate((d) => { d.settings = { ...d.settings, ...patch } }),

      getDay: (date) => data.days[date] ?? blankDay(date, data.settings.defaultProductionId),

      setDay: (date, patch) =>
        mutate((d) => {
          const existing = d.days[date] ?? blankDay(date, d.settings.defaultProductionId)
          d.days[date] = { ...existing, ...patch }
        }),

      clearDay: (date) => mutate((d) => { delete d.days[date] }),

      addExpense: (e) => mutate((d) => { d.expenses.push({ ...e, id: uid() }) }),
      updateExpense: (id, patch) =>
        mutate((d) => { d.expenses = d.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) }),
      removeExpense: (id) => mutate((d) => { d.expenses = d.expenses.filter((e) => e.id !== id) }),

      addPayment: (p) => mutate((d) => { d.payments.push({ ...p, id: uid() }) }),
      updatePayment: (id, patch) =>
        mutate((d) => { d.payments = d.payments.map((p) => (p.id === id ? { ...p, ...patch } : p)) }),
      removePayment: (id) => mutate((d) => { d.payments = d.payments.filter((p) => p.id !== id) }),

      addProduction: (p) => {
        const id = uid()
        mutate((d) => {
          d.productions.push({ ...p, id })
          if (!d.settings.defaultProductionId) d.settings.defaultProductionId = id
        })
        return id
      },
      updateProduction: (id, patch) =>
        mutate((d) => { d.productions = d.productions.map((p) => (p.id === id ? { ...p, ...patch } : p)) }),
      removeProduction: (id) =>
        mutate((d) => {
          d.productions = d.productions.filter((p) => p.id !== id)
          if (d.settings.defaultProductionId === id) {
            d.settings.defaultProductionId = d.productions[0]?.id ?? null
          }
        }),

      startShift: (productionId, tariff) =>
        mutate((d) => {
          d.activeShift = { date: todayISO(), startedAt: Date.now(), productionId, tariff }
        }),

      stopShift: () =>
        mutate((d) => {
          const shift = d.activeShift
          if (!shift) return
          const start = new Date(shift.startedAt)
          const end = new Date()
          const hhmm = (x: Date) =>
            `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
          const existing = d.days[shift.date] ?? blankDay(shift.date, shift.productionId)
          d.days[shift.date] = {
            ...existing,
            worked: true,
            productionId: shift.productionId,
            tariff: shift.tariff,
            start: hhmm(start),
            end: hhmm(end),
          }
          d.activeShift = null
        }),

      replaceAll: (next) => setData(next),

      productionOf: (id) => data.productions.find((p) => p.id === id),
    }
  }, [data])

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

/** The month the app opens on: the current one. */
export function useDefaultMonth(): string {
  return monthKey(todayISO())
}
