import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { summariseMonth } from '../lib/stats'
import { money, moneyShort } from '../lib/format'
import { addMonths, formatDuration, monthLabel, startOfWeek, formatHM, DAY_SHORT, parseDate } from '../lib/time'
import { Card, CardHead, Empty, Segmented, Stat } from '../components/ui'
import { MonthHeat, ShiftTimeline } from '../components/charts'
import {
  IconAlert, IconChevronLeft, IconChevronRight, IconClock, IconMoon, IconCoins,
} from '../components/Icons'

type View = 'timeline' | 'calendar' | 'list'

export function Timeline({ month, setMonth, onPickDay }: {
  month: string
  setMonth: (m: string) => void
  onPickDay: (date: string) => void
}) {
  const store = useStore()
  const { settings } = store
  const [view, setView] = useState<View>('timeline')
  const summary = useMemo(() => summariseMonth(month, store.data), [month, store.data])

  // Group the month into weeks so the weekly quota is visible where it bites.
  const weeks = useMemo(() => {
    const map = new Map<string, typeof summary.days>()
    for (const d of summary.days) {
      const wk = startOfWeek(d.date, settings.weekStartsOn)
      if (!map.has(wk)) map.set(wk, [])
      map.get(wk)!.push(d)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [summary.days, settings.weekStartsOn])

  return (
    <>
      <div className="hero">
        <div className="hero-top">
          <div className="hero-brand">
            <span className="hero-mark"><IconClock size={19} /></span>
            <div>
              <div className="hero-title">Timeline</div>
              <div className="hero-sub">Every hour you were on the clock</div>
            </div>
          </div>
        </div>
        <div className="hero-body readout">
          <div className="inline" style={{ gap: 6 }}>
            <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
              <IconChevronLeft size={18} />
            </button>
            <span style={{ fontWeight: 600, minWidth: 128, textAlign: 'center' }}>{monthLabel(month)}</span>
            <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
              <IconChevronRight size={18} />
            </button>
          </div>
          <div className="meta" style={{ marginTop: 12 }}>
            <span><b>{formatDuration(summary.hours)}</b> total</span>
            <span><b>{summary.workedDays}</b> days</span>
            <span><b>{formatDuration(summary.overtimeHours)}</b> overtime</span>
          </div>
        </div>
      </div>

      <div className="inline between" style={{ marginBottom: 12 }}>
        <Segmented
          value={view} onChange={setView}
          options={[
            { value: 'timeline', label: 'Timeline' },
            { value: 'calendar', label: 'Calendar' },
            { value: 'list', label: 'List' },
          ]}
        />
      </div>

      <div className="stats" style={{ marginBottom: 4 }}>
        <Stat icon={<IconClock size={14} />} label="Hours" value={formatHM(summary.hours)} />
        <Stat icon={<IconClock size={14} />} label="Overtime" value={formatHM(summary.overtimeHours)} tone="warm" />
        <Stat icon={<IconMoon size={14} />} label="Night" value={formatHM(summary.nightHours)} tone="accent" />
        <Stat icon={<IconCoins size={14} />} label="Per hour" value={moneyShort(summary.avgPerHour, settings)}
          hint="Effective" tone="good" />
      </div>

      {summary.workedDays === 0 && (
        <Card><Empty art="🌊" title={`Nothing logged in ${monthLabel(month)}`}>
          Days you work will show up here as bars across a 24-hour day.
        </Empty></Card>
      )}

      {view === 'timeline' && summary.workedDays > 0 && (
        <>
          <Card>
            <CardHead title="The whole month" sub="Shaded bands are night hours. Orange means you went into overtime." />
            <ShiftTimeline days={summary.days} settings={settings} onPick={onPickDay} />
          </Card>

          {weeks.map(([wk, days]) => {
            const hours = days.reduce((s, d) => s + d.hours, 0)
            const gross = days.reduce((s, d) => s + d.total, 0)
            const over = hours > settings.weeklyQuotaHours
            return (
              <Card key={wk}>
                <CardHead
                  title={`Week of ${prettyWeek(wk)}`}
                  sub={`${formatDuration(hours)} · ${money(gross, settings, { decimals: 0 })}`}
                  action={over ? <span className="chip bad"><IconAlert size={12} /> Over quota</span> : undefined}
                />
                <ShiftTimeline days={days} settings={settings} onPick={onPickDay} />
              </Card>
            )
          })}
        </>
      )}

      {view === 'calendar' && (
        <Card>
          <CardHead title={monthLabel(month)} sub="Darker means longer. Coral is your longest days." />
          <MonthHeat days={summary.days} weekStartsOn={settings.weekStartsOn} onPick={onPickDay} />
        </Card>
      )}

      {view === 'list' && (
        <Card>
          <CardHead title="Day by day" />
          <div className="rows">
            {summary.days.filter((d) => d.worked || d.misc !== 0).map((d) => {
              const day = store.data.days[d.date]
              const date = parseDate(d.date)
              return (
                <button key={d.date} className="row" onClick={() => onPickDay(d.date)}>
                  <span className="row-lead day filled">
                    <span className="d">{date.getDate()}</span>
                    <span className="w">{DAY_SHORT[date.getDay()]}</span>
                  </span>
                  <span className="row-main">
                    <span className="row-title">
                      {day?.start && day?.end ? `${day.start} → ${day.end}` : 'No times'}
                      {d.flags.includes('overtime') && <span className="chip warm">OT {formatHM(d.overtimeHours)}</span>}
                      {d.flags.includes('rest-day') && <span className="chip gold">Rest day</span>}
                      {d.flags.includes('short-turnaround') && <span className="chip bad">Short rest</span>}
                    </span>
                    <span className="row-sub">
                      {formatDuration(d.hours)}
                      {day?.note ? ` · ${day.note}` : ''}
                    </span>
                  </span>
                  <span className="row-amount">
                    {money(d.total, settings, { decimals: 0 })}
                    {d.extras > 0 && <span className="sub">+{moneyShort(d.extras, settings)} extras</span>}
                  </span>
                </button>
              )
            })}
          </div>
          {summary.days.every((d) => !d.worked) && (
            <Empty art="🐚" title="Empty month"><span>Nothing logged yet.</span></Empty>
          )}
        </Card>
      )}

      <Card>
        <CardHead title="How a day is priced" />
        <ul className="explain">
          <li><b>The day rate</b> covers the first {formatHM(settings.regularDayHours)} ({formatHM(settings.eveDayHours)} on a rest-day eve).</li>
          <li><b>Overtime</b> runs {settings.overtimeFirstMultiplier}× up to hour 12, 2× from 12 to 13, then 2.5× and climbing {settings.overtimeStep}× every hour after that.</li>
          <li><b>Night hours</b> between {settings.nightStart} and {settings.nightEnd} add {Math.round(settings.nightRate * 100)}% of your hourly rate.</li>
          <li><b>Short turnaround</b> — under {settings.minTurnaroundHours}h rest between two work days — is charged on a rising scale.</li>
          <li><b>Rest days</b> pay {settings.restDayMultiplier}× the day rate.</li>
          <li><b>Over {settings.weeklyQuotaHours}h in a week</b> adds a weekly overage charge.</li>
        </ul>
      </Card>
    </>
  )
}

function prettyWeek(iso: string): string {
  const d = parseDate(iso)
  return `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`
}
