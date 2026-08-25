import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { summariseMonth, summariseWeek, currentStreak, outstanding, trend } from '../lib/stats'
import { money, moneyShort, percent } from '../lib/format'
import { overtimePay } from '../lib/pay'
import {
  addMonths, formatDuration, formatHM, monthLabel, prettyDate, todayISO, DAY_SHORT,
  daysInMonth, parseDate,
} from '../lib/time'
import { Bar, Card, CardHead, Empty, Stat } from '../components/ui'
import { Columns, Sparkline } from '../components/charts'
import { MonthNav } from '../components/MonthNav'
import { PendingBookings } from '../components/PendingBookings'
import {
  IconAlert, IconCalendar, IconClock, IconCoins,
  IconFire, IconMoon, IconPlay, IconStop, IconTarget, IconWallet, IconSurf,
} from '../components/Icons'

export function Dashboard({ month, setMonth, onPickDay }: {
  month: string
  setMonth: (m: string) => void
  onPickDay: (date: string) => void
}) {
  const store = useStore()
  const { settings } = store
  const today = todayISO()

  const summary = useMemo(() => summariseMonth(month, store.data), [month, store.data])
  const prev = useMemo(() => summariseMonth(addMonths(month, -1), store.data), [month, store.data])
  const week = useMemo(() => summariseWeek(today, store.data), [today, store.data])
  const streak = useMemo(() => currentStreak(store.data), [store.data])
  const owed = useMemo(() => outstanding(store.data.payments), [store.data.payments])

  const goalPct = settings.monthlyGoal > 0 ? summary.gross / settings.monthlyGoal : 0
  const grossTrend = trend(summary.gross, prev.gross)

  // Last six months of earnings, for the little column chart.
  const recent = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const key = addMonths(month, i - 5)
      return { label: monthLabel(key).slice(0, 3), value: summariseMonth(key, store.data).gross, key }
    })
  }, [month, store.data])

  const upcoming = useMemo(() => {
    const dates = daysInMonth(month).filter((d) => d >= today).slice(0, 0)
    return dates
  }, [month, today])

  const recentDays = useMemo(
    () => summary.days.filter((d) => d.worked).slice(-5).reverse(),
    [summary.days],
  )

  return (
    <>
      <div className="hero">
        <div className="hero-body readout">
          <MonthNav month={month} setMonth={setMonth} />
          <div className="label" style={{ marginTop: 12 }}>Earned in {monthLabel(month)}</div>
          <div className="value">{money(summary.gross, settings, { decimals: 0 })}</div>
          <div className="meta">
            <span><b>{summary.workedDays}</b> days</span>
            <span><b>{formatDuration(summary.hours)}</b> on the clock</span>
            {summary.workedDays > 0 && <span><b>{moneyShort(summary.avgPerDay, settings)}</b> a day</span>}
            {grossTrend.pct !== null && (
              <span style={{ opacity: .85 }}>
                {grossTrend.delta >= 0 ? '▲' : '▼'} {percent(Math.abs(grossTrend.pct))} vs last month
              </span>
            )}
          </div>
        </div>
      </div>

      <ShiftClock />

      <PendingBookings onPickDay={onPickDay} />

      {settings.monthlyGoal > 0 && (
        <Card>
          <div className="inline between" style={{ marginBottom: 8 }}>
            <span className="inline"><IconTarget size={17} /><b>Monthly goal</b></span>
            <span className="tiny muted">
              {money(summary.gross, settings, { decimals: 0 })} of {money(settings.monthlyGoal, settings, { decimals: 0 })}
            </span>
          </div>
          <Bar value={summary.gross} max={settings.monthlyGoal} warm={goalPct >= 1} />
          <p className="tiny muted" style={{ marginTop: 8 }}>
            {goalPct >= 1
              ? `Goal cleared by ${money(summary.gross - settings.monthlyGoal, settings, { decimals: 0 })}. Go get a nasi goreng.`
              : summary.avgPerDay > 0
                ? `About ${Math.ceil((settings.monthlyGoal - summary.gross) / summary.avgPerDay)} more days at your current day average.`
                : `${percent(goalPct)} of the way there.`}
          </p>
        </Card>
      )}

      <div className="section-title">This month</div>
      <div className="stats">
        <Stat icon={<IconCalendar size={14} />} label="Days worked" value={String(summary.workedDays)}
          hint={summary.workedDays ? `${formatDuration(summary.hours / summary.workedDays)} average` : 'None yet'} />
        <Stat icon={<IconClock size={14} />} label="Overtime" value={formatDuration(summary.overtimeHours)}
          hint={money(summary.overtime, settings, { decimals: 0 })} tone="warm" />
        <Stat icon={<IconMoon size={14} />} label="Night hours" value={formatDuration(summary.nightHours)}
          hint="Paid at a premium" tone="accent" />
        <Stat icon={<IconFire size={14} />} label="Streak" value={`${streak}d`}
          hint={streak >= 6 ? 'Take a day off' : 'Days in a row'} tone={streak >= 6 ? 'bad' : ''} />
      </div>

      <div className="section-title">Money</div>
      <div className="stats">
        <Stat icon={<IconCoins size={14} />} label="Before VAT" value={moneyShort(summary.gross, settings)} />
        <Stat icon={<IconCoins size={14} />} label="To invoice" value={moneyShort(summary.invoiceTotal, settings)}
          hint={settings.chargeVat ? `incl. ${percent(settings.vatRate)} VAT` : 'no VAT'} tone="accent" />
        <Stat icon={<IconWallet size={14} />} label="Spent" value={moneyShort(summary.spent, settings)}
          hint={summary.billableSpent > 0 ? `${moneyShort(summary.billableSpent, settings)} billable` : 'This month'} tone="warm" />
        <Stat icon={<IconSurf size={14} />} label="Kept" value={moneyShort(summary.net, settings)}
          hint={`after ${percent(settings.taxSetAside)} tax`} tone={summary.net >= 0 ? 'good' : 'bad'} />
      </div>

      {owed.owed > 0 && (
        <Card>
          <CardHead title="Waiting to land" sub={`${money(owed.owed, settings, { decimals: 0 })} invoiced or expected`} />
          <div className="legend">
            <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--gold)' }} />
              <span className="muted">Expected</span><span className="amt">{money(owed.expected, settings)}</span></div>
            <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--accent)' }} />
              <span className="muted">Invoiced</span><span className="amt">{money(owed.invoiced, settings)}</span></div>
            <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--good)' }} />
              <span className="muted">Paid</span><span className="amt">{money(owed.paid, settings)}</span></div>
          </div>
        </Card>
      )}

      <Card>
        <CardHead title="This week" sub={`${week.workedDays} days · ${formatDuration(week.hours)}`} />
        <WeekStrip onPickDay={onPickDay} />
        {week.overQuota && (
          <p className="tiny" style={{ color: 'var(--warm)', marginTop: 10 }}>
            <IconAlert size={13} /> Past the {settings.weeklyQuotaHours}h weekly quota — the overage is charged on top.
          </p>
        )}
      </Card>

      <Card>
        <CardHead title="Last six months" sub="Before VAT" />
        <Columns data={recent.map((r) => ({ label: r.label, value: r.value, tone: r.key === month ? 'sun' as const : 'sea' as const }))} settings={settings} />
        <div style={{ marginTop: 10 }}><Sparkline values={recent.map((r) => r.value)} /></div>
      </Card>

      {recentDays.length > 0 ? (
        <Card>
          <CardHead title="Recent days" />
          <div className="rows">
            {recentDays.map((d) => (
              <button key={d.date} className="row" onClick={() => onPickDay(d.date)}>
                <span className="row-lead day filled">
                  <span className="d">{parseDate(d.date).getDate()}</span>
                  <span className="w">{DAY_SHORT[parseDate(d.date).getDay()]}</span>
                </span>
                <span className="row-main">
                  <span className="row-title">{formatDuration(d.hours)}
                    {d.overtimeHours > 0 && <span className="chip warm">OT</span>}
                    {d.nightHours > 0 && <span className="chip accent"><IconMoon size={11} /></span>}
                  </span>
                  <span className="row-sub">{prettyDate(d.date)}</span>
                </span>
                <span className="row-amount">{money(d.total, settings, { decimals: 0 })}</span>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <Empty art="🏝️" title="Nothing logged yet">
            Tap the + button to add the day you worked. Everything else — overtime,
            night hours, rest gaps — is worked out for you.
          </Empty>
        </Card>
      )}
      {upcoming.length === 0 && null}
    </>
  )
}

/** Seven pills for the current week, tap to edit. */
function WeekStrip({ onPickDay }: { onPickDay: (date: string) => void }) {
  const store = useStore()
  const week = useMemo(() => summariseWeek(todayISO(), store.data), [store.data])
  const today = todayISO()
  const max = Math.max(1, ...week.days.map((d) => d.hours))

  return (
    <div className="week-strip">
      {week.days.map((d) => {
        const date = parseDate(d.date)
        return (
          <button
            key={d.date} type="button"
            className={`week-pill ${d.worked ? 'on' : ''} ${d.date === today ? 'today' : ''}`}
            onClick={() => onPickDay(d.date)}
          >
            <span className="wd">{DAY_SHORT[date.getDay()][0]}</span>
            <span className="wfill"><span style={{ height: `${d.worked ? (d.hours / max) * 100 : 0}%` }} /></span>
            <span className="wn">{date.getDate()}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * The start/stop control. When idle it is a single obvious button; while a
 * shift runs it becomes a live timer with the hours and the money so far.
 */
function ShiftClock() {
  const store = useStore()
  const { settings, activeShift } = store
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!activeShift) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [activeShift])

  const production = store.productionOf(activeShift?.productionId ?? settings.defaultProductionId ?? null)
  const rate = production?.rates[(activeShift?.tariff ?? 1) - 1] ?? 0
  const quota = settings.regularDayHours

  if (!activeShift) {
    return (
      <div className="timer-card">
        <button className="timer-start" onClick={() => store.startShift(settings.defaultProductionId, 1)}>
          <IconPlay size={30} />
          <span>Start work</span>
        </button>
        <div className="timer-note">
          <b>{production?.name ?? 'No job set'}</b>
          <span>{money(rate, settings, { decimals: 0 })} a day · {formatHM(quota)} covered</span>
        </div>
      </div>
    )
  }

  const elapsed = Math.max(0, (now - activeShift.startedAt) / 3_600_000)
  const hourly = quota > 0 ? rate / quota : 0
  const earned = rate + overtimePay(Math.max(0, elapsed - quota), quota, hourly, settings)
  const started = new Date(activeShift.startedAt)
  const startedLabel = `${String(started.getHours()).padStart(2, '0')}:${String(started.getMinutes()).padStart(2, '0')}`

  return (
    <div className="timer-card live">
      <div className="timer-live">
        <div className="timer-live-top">
          <span className="pulse" />
          <span>Working since {startedLabel}</span>
        </div>
        <div className="timer-elapsed">{formatStopwatch(elapsed)}</div>
        <div className="timer-earned">
          {money(earned, settings, { decimals: 0 })}
          <span> so far{elapsed > quota ? ' · in overtime' : ''}</span>
        </div>
      </div>
      <button className="timer-stop" onClick={() => store.stopShift()}>
        <IconStop size={26} />
        <span>Stop</span>
      </button>
    </div>
  )
}

/** h:mm:ss, so the seconds visibly tick. */
function formatStopwatch(hours: number): string {
  const total = Math.floor(hours * 3600)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
