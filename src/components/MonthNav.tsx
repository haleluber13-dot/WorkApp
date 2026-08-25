import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { summariseMonth } from '../lib/stats'
import { moneyShort } from '../lib/format'
import { MONTH_NAMES, addMonths, monthKey, monthLabel, todayISO } from '../lib/time'
import { Sheet } from './ui'
import { IconChevronDown, IconChevronLeft, IconChevronRight } from './Icons'

/**
 * Month header: arrows for stepping, and the label itself opens a year at a
 * glance so you can jump straight to a month instead of clicking through.
 * Colours come from `currentColor`, so it sits on any hero.
 */
export function MonthNav({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const [picking, setPicking] = useState(false)

  return (
    <>
      <div className="hero-nav">
        <button className="hero-nav-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
          <IconChevronLeft size={18} />
        </button>
        <button className="hero-nav-label" onClick={() => setPicking(true)}>
          {monthLabel(month)}
          <IconChevronDown size={15} />
        </button>
        <button className="hero-nav-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
          <IconChevronRight size={18} />
        </button>
      </div>
      {picking && (
        <MonthPicker
          month={month}
          onPick={(m) => { setMonth(m); setPicking(false) }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  )
}

/** A year of months with what each one earned, so you can see where the work was. */
export function MonthPicker({
  month, onPick, onClose,
}: { month: string; onPick: (m: string) => void; onClose: () => void }) {
  const store = useStore()
  const [year, setYear] = useState(Number(month.slice(0, 4)))
  const thisMonth = monthKey(todayISO())

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`
      const s = summariseMonth(key, store.data)
      return { key, name: MONTH_NAMES[i], gross: s.gross, days: s.workedDays }
    }),
    [year, store.data],
  )

  const yearTotal = months.reduce((sum, m) => sum + m.gross, 0)
  const yearDays = months.reduce((sum, m) => sum + m.days, 0)

  return (
    <Sheet title="Jump to a month" onClose={onClose}>
      <div className="stack">
        <div className="year-nav">
          <button className="btn ghost" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
            <IconChevronLeft size={18} />
          </button>
          <div className="year-nav-mid">
            <b>{year}</b>
            <span className="tiny muted">
              {yearDays > 0 ? `${yearDays} days · ${moneyShort(yearTotal, store.settings)}` : 'Nothing logged'}
            </span>
          </div>
          <button className="btn ghost" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
            <IconChevronRight size={18} />
          </button>
        </div>

        <div className="month-grid">
          {months.map((m) => (
            <button
              key={m.key} type="button"
              className={`month-cell ${m.key === month ? 'on' : ''} ${m.gross > 0 ? 'has-work' : ''}`}
              onClick={() => onPick(m.key)}
            >
              <span className="mc-name">{m.name.slice(0, 3)}</span>
              {m.gross > 0 ? (
                <>
                  <span className="mc-amount">{moneyShort(m.gross, store.settings)}</span>
                  <span className="mc-days">{m.days}d</span>
                </>
              ) : (
                <span className="mc-empty">—</span>
              )}
              {m.key === thisMonth && <span className="mc-now">now</span>}
            </button>
          ))}
        </div>

        <button className="btn block" onClick={() => onPick(thisMonth)}>Go to this month</button>
      </div>
    </Sheet>
  )
}
