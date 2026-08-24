import type { DayPay } from '../../lib/pay'
import type { Settings } from '../../types'
import { DAY_SHORT, formatClock, formatDuration, parseDate, parseTime } from '../../lib/time'
import { moneyShort } from '../../lib/format'

/* ── 24-hour shift timeline ──────────────────────────────────────────────
   One row per day. The bar spans the clock hours you were actually on, and
   wraps onto a second segment when a shift runs past midnight.            */

export function ShiftTimeline({
  days, settings, onPick,
}: { days: DayPay[]; settings: Settings; onPick?: (date: string) => void }) {
  const nightStart = parseTime(settings.nightStart) ?? 22
  const nightEnd = parseTime(settings.nightEnd) ?? 5
  const marks = [0, 6, 12, 18, 24]

  return (
    <div className="tl">
      <div className="tl-axis">
        <span className="tl-gutter" />
        <div className="tl-track">
          {marks.map((h) => (
            <span key={h} className="tl-mark" style={{ left: `${(h / 24) * 100}%` }}>
              {h === 24 ? '24' : String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>

      <div className="tl-rows">
        {days.map((d) => {
          const date = parseDate(d.date)
          const segments: { left: number; width: number; head: boolean }[] = []
          if (d.startAbs !== null && d.endAbs !== null) {
            const s = d.startAbs
            const e = d.endAbs
            segments.push({ left: (s / 24) * 100, width: (Math.min(e, 24) - s) / 24 * 100, head: true })
            if (e > 24) segments.push({ left: 0, width: ((e - 24) / 24) * 100, head: false })
          }
          const overtime = d.overtimeHours > 0
          return (
            <button
              key={d.date} className={`tl-row ${d.worked ? '' : 'idle'}`} type="button"
              onClick={() => onPick?.(d.date)}
              title={d.worked ? `${formatDuration(d.hours)} — ${moneyShort(d.total, settings)}` : 'No work'}
            >
              <span className="tl-gutter">
                <b>{date.getDate()}</b>
                <i>{DAY_SHORT[date.getDay()]}</i>
              </span>
              <span className="tl-track">
                <span className="tl-night" style={{ left: `${(nightStart / 24) * 100}%`, width: `${((24 - nightStart) / 24) * 100}%` }} />
                <span className="tl-night" style={{ left: 0, width: `${(nightEnd / 24) * 100}%` }} />
                {marks.slice(1, -1).map((h) => (
                  <span key={h} className="tl-grid" style={{ left: `${(h / 24) * 100}%` }} />
                ))}
                {segments.map((seg, i) => (
                  <span
                    key={i}
                    className={`tl-bar ${overtime ? 'ot' : ''} ${seg.head ? '' : 'tail'}`}
                    style={{ left: `${seg.left}%`, width: `${Math.max(seg.width, 1.2)}%` }}
                  >
                    {seg.head && seg.width > 28 && (
                      <em>{formatClock(d.startAbs!)}–{formatClock(d.endAbs!)}</em>
                    )}
                  </span>
                ))}
              </span>
              <span className="tl-total">
                {d.worked ? formatDuration(d.hours) : ''}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Simple column chart ─────────────────────────────────────────────── */

export function Columns({
  data, settings, height = 130,
}: { data: { label: string; value: number; tone?: 'sea' | 'sun' }[]; settings: Settings; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="cols" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="col" title={`${d.label}: ${moneyShort(d.value, settings)}`}>
          <div className="col-bar-wrap">
            <div
              className={`col-bar ${d.tone === 'sun' ? 'sun' : ''}`}
              style={{ height: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="col-label">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Donut ───────────────────────────────────────────────────────────── */

export function Donut({
  slices, total, caption, size = 148,
}: { slices: { label: string; value: number; color: string }[]; total: string; caption?: string; size?: number }) {
  const r = size / 2 - 14
  const c = 2 * Math.PI * r
  let offset = 0
  const sum = slices.reduce((s, x) => s + x.value, 0) || 1

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={caption ?? 'Breakdown'}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunk)" strokeWidth={16} />
        {slices.map((s, i) => {
          const len = (s.value / sum) * c
          const el = (
            <circle
              key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={s.color} strokeWidth={16} strokeLinecap="butt"
              strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )
          offset += len
          return el
        })}
        <text x="50%" y="47%" textAnchor="middle" className="donut-value">{total}</text>
        {caption && <text x="50%" y="61%" textAnchor="middle" className="donut-caption">{caption}</text>}
      </svg>
    </div>
  )
}

/* ── Calendar heat grid ──────────────────────────────────────────────── */

export function MonthHeat({
  days, weekStartsOn, onPick,
}: { days: DayPay[]; weekStartsOn: number; onPick?: (date: string) => void }) {
  if (!days.length) return null
  const max = Math.max(1, ...days.map((d) => d.hours))
  const first = parseDate(days[0].date)
  const lead = (first.getDay() - weekStartsOn + 7) % 7
  const headers = Array.from({ length: 7 }, (_, i) => DAY_SHORT[(weekStartsOn + i) % 7])

  return (
    <div className="heat">
      {headers.map((h) => <span key={h} className="heat-head">{h[0]}</span>)}
      {Array.from({ length: lead }, (_, i) => <span key={`p${i}`} />)}
      {days.map((d) => {
        const level = d.worked ? Math.min(4, Math.ceil((d.hours / max) * 4)) : 0
        return (
          <button
            key={d.date} type="button" className={`heat-cell lv${level}`}
            onClick={() => onPick?.(d.date)}
            title={`${d.date}${d.worked ? ` — ${formatDuration(d.hours)}` : ''}`}
          >
            {parseDate(d.date).getDate()}
          </button>
        )
      })}
    </div>
  )
}

/* ── Sparkline ───────────────────────────────────────────────────────── */

export function Sparkline({ values, height = 40 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const w = 100
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = height - ((v - min) / span) * (height - 6) - 3
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" height={height} aria-hidden="true">
      <polyline points={`0,${height} ${pts.join(' ')} ${w},${height}`} className="spark-fill" />
      <polyline points={pts.join(' ')} className="spark-line" />
    </svg>
  )
}
