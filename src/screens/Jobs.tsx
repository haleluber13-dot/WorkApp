import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { forecast, summariseJob } from '../lib/stats'
import { money, moneyShort } from '../lib/format'
import { addDays, formatDuration, prettyDate, todayISO } from '../lib/time'
import type { Production } from '../types'
import { PRODUCTION_COLORS } from '../lib/defaults'
import {
  Card, CardHead, Empty, Field, NumberInput, Sheet, Stat, TextInput, Toggle,
} from '../components/ui'
import {
  IconCalendar, IconCamera, IconCheck, IconClock, IconCoins, IconPlus,
  IconSparkle, IconTrash, IconBoat,
} from '../components/Icons'
import { PendingBookings } from '../components/PendingBookings'

export function Jobs({ onPickDay }: { onPickDay: (date: string) => void }) {
  const store = useStore()
  const { settings } = store
  const [editing, setEditing] = useState<Production | 'new' | null>(null)
  const [booking, setBooking] = useState<Production | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const today = todayISO()
  const ahead = useMemo(() => forecast(store.data, today), [store.data, today])

  const jobs = useMemo(
    () => store.data.productions
      .filter((p) => showArchived || !p.archived)
      .map((p) => summariseJob(p, store.data))
      .sort((a, b) => {
        if (a.production.archived !== b.production.archived) return a.production.archived ? 1 : -1
        return (b.lastDate ?? b.firstDate ?? '').localeCompare(a.lastDate ?? a.firstDate ?? '')
      }),
    [store.data, showArchived],
  )

  const archivedCount = store.data.productions.filter((p) => p.archived).length

  return (
    <>
      <div className="hero" style={{ background: 'var(--grad-dawn)' }}>
        <div className="hero-top">
          <div className="hero-brand">
            <span className="hero-mark"><IconCamera size={19} /></span>
            <div>
              <div className="hero-title">Jobs</div>
              <div className="hero-sub">One production after the next</div>
            </div>
          </div>
          <div className="hero-actions">
            <button className="icon-btn" onClick={() => setEditing('new')} aria-label="New job">
              <IconPlus size={19} />
            </button>
          </div>
        </div>
        <div className="hero-body readout">
          <div className="label">Booked ahead</div>
          <div className="value">{money(ahead.value, settings, { decimals: 0 })}</div>
          <div className="meta">
            <span><b>{ahead.bookedDays}</b> days pencilled in</span>
            {ahead.nextDate && <span>Next up <b>{prettyDate(ahead.nextDate)}</b></span>}
          </div>
        </div>
      </div>

      <div className="stats">
        <Stat icon={<IconCamera size={14} />} label="Active jobs"
          value={String(store.data.productions.filter((p) => !p.archived).length)} />
        <Stat icon={<IconCalendar size={14} />} label="Booked days" value={String(ahead.bookedDays)} tone="accent" />
        <Stat icon={<IconCoins size={14} />} label="Pipeline" value={moneyShort(ahead.value, settings)} tone="good" />
        <Stat icon={<IconClock size={14} />} label="Logged"
          value={formatDuration(jobs.reduce((s, j) => s + j.hours, 0))} />
      </div>

      <PendingBookings onPickDay={onPickDay} />

      {jobs.length === 0 ? (
        <Card>
          <Empty art="🎬" title="No jobs yet">
            Add a production, set its three day rates, and every day you log against it
            gets priced automatically. Add the next one when it comes along.
          </Empty>
          <button className="btn primary block" onClick={() => setEditing('new')}>
            <IconPlus size={16} /> Add your first job
          </button>
        </Card>
      ) : (
        <div className="stack" style={{ marginTop: 16 }}>
          {jobs.map((j) => (
            <Card key={j.production.id} className={j.production.archived ? 'dim' : ''}>
              <div className="job-head">
                <span className="job-dot" style={{ background: j.production.color }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="inline" style={{ gap: 7 }}>
                    <b style={{ fontSize: 15.5 }}>{j.production.name}</b>
                    {j.production.archived && <span className="chip">Wrapped</span>}
                    {j.bookedDays > 0 && <span className="chip accent">{j.bookedDays} booked</span>}
                  </div>
                  <div className="tiny muted">
                    {[j.production.role, j.production.company].filter(Boolean).join(' · ') || 'No role set'}
                    {j.production.startsOn && ` · from ${prettyDate(j.production.startsOn)}`}
                  </div>
                </div>
                <button className="btn ghost sm" onClick={() => setEditing(j.production)}>Edit</button>
              </div>

              <div className="job-stats">
                <div><span className="k">Days</span><span className="v">{j.workedDays}</span></div>
                <div><span className="k">Hours</span><span className="v">{formatDuration(j.hours)}</span></div>
                <div><span className="k">Earned</span><span className="v">{moneyShort(j.earned, settings)}</span></div>
                <div><span className="k">Day rate</span><span className="v">{moneyShort(j.production.rates[0], settings)}</span></div>
              </div>

              {j.forecast > 0 && (
                <p className="tiny muted" style={{ marginTop: 10 }}>
                  <IconSparkle size={13} /> {moneyShort(j.forecast, settings)} still booked across {j.bookedDays} days.
                </p>
              )}

              <div className="inline" style={{ marginTop: 12, gap: 8 }}>
                <button className="btn sm" onClick={() => setBooking(j.production)}>
                  <IconCalendar size={15} /> Book days
                </button>
                {!j.production.archived && (
                  <button
                    className="btn ghost sm"
                    onClick={() => store.updateProduction(j.production.id, { archived: true })}
                  >
                    <IconCheck size={15} /> Mark wrapped
                  </button>
                )}
                {j.production.archived && (
                  <button
                    className="btn ghost sm"
                    onClick={() => store.updateProduction(j.production.id, { archived: false })}
                  >
                    Reopen
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {archivedCount > 0 && (
        <button className="btn ghost block" style={{ marginTop: 14 }} onClick={() => setShowArchived((s) => !s)}>
          {showArchived ? 'Hide' : `Show ${archivedCount} wrapped`} job{archivedCount === 1 ? '' : 's'}
        </button>
      )}

      {ahead.bookedDays > 0 && (
        <Card>
          <CardHead title="Coming up" sub="Days you have pencilled in" />
          <div className="rows">
            {Object.values(store.data.days)
              .filter((d) => d.booked && !d.worked && d.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 12)
              .map((d) => {
                const p = store.productionOf(d.productionId)
                return (
                  <button key={d.date} className="row" onClick={() => onPickDay(d.date)}>
                    <span className="row-lead" style={{ background: p ? `color-mix(in srgb, ${p.color} 20%, transparent)` : undefined }}>
                      <IconCalendar size={18} />
                    </span>
                    <span className="row-main">
                      <span className="row-title">{prettyDate(d.date)}</span>
                      <span className="row-sub">{p?.name ?? 'No job'}</span>
                    </span>
                    <span className="row-amount faint">
                      ~{moneyShort(p?.rates[d.tariff - 1] ?? 0, settings)}
                    </span>
                  </button>
                )
              })}
          </div>
        </Card>
      )}

      {editing && (
        <JobSheet
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {booking && <BookingSheet production={booking} onClose={() => setBooking(null)} />}
    </>
  )
}

function JobSheet({ initial, onClose }: { initial: Production | null; onClose: () => void }) {
  const store = useStore()
  const { settings } = store
  const used = store.data.productions.map((p) => p.color)
  const [name, setName] = useState(initial?.name ?? '')
  const [company, setCompany] = useState(initial?.company ?? '')
  const [role, setRole] = useState(initial?.role ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [rates, setRates] = useState<[number, number, number]>(initial?.rates ?? [850, 1500, 2000])
  const [color, setColor] = useState(initial?.color ?? PRODUCTION_COLORS.find((c) => !used.includes(c)) ?? PRODUCTION_COLORS[0])
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? '')
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [makeDefault, setMakeDefault] = useState(
    initial ? settings.defaultProductionId === initial.id : true,
  )

  const setRate = (i: number, v: number) =>
    setRates((r) => r.map((x, j) => (j === i ? v : x)) as [number, number, number])

  const save = () => {
    const payload = {
      name: name.trim() || 'Untitled job', company, role, address, rates, color,
      archived: initial?.archived ?? false,
      startsOn: startsOn || null, endsOn: endsOn || null, note,
    }
    const id = initial ? (store.updateProduction(initial.id, payload), initial.id) : store.addProduction(payload)
    if (makeDefault) store.setSettings({ defaultProductionId: id })
    onClose()
  }

  return (
    <Sheet
      title={initial ? 'Edit job' : 'New job'}
      onClose={onClose}
      action={initial && store.data.productions.length > 1 ? (
        <button className="btn ghost sm" aria-label="Delete job"
          onClick={() => { store.removeProduction(initial.id); onClose() }}>
          <IconTrash size={17} />
        </button>
      ) : undefined}
    >
      <div className="stack">
        <div className="card">
          <div className="stack tight">
            <Field label="Job / production name">
              <TextInput value={name} onChange={setName} placeholder="Ocean Drive, season 2" autoFocus />
            </Field>
            <div className="field-row">
              <Field label="Your role"><TextInput value={role} onChange={setRole} placeholder="Focus puller" /></Field>
              <Field label="Company"><TextInput value={company} onChange={setCompany} placeholder="Production house" /></Field>
            </div>
            <Field label="Company address" hint="Printed on invoices.">
              <TextInput value={address} onChange={setAddress} placeholder="Street, city" />
            </Field>
          </div>
        </div>

        <div className="card">
          <CardHead title="Day rates" sub="Three steps — pick one per day when you log it." />
          <div className="field-row three">
            <Field label="Rate 1"><NumberInput value={rates[0]} onChange={(v) => setRate(0, v)} suffix={settings.currency} min={0} /></Field>
            <Field label="Rate 2"><NumberInput value={rates[1]} onChange={(v) => setRate(1, v)} suffix={settings.currency} min={0} /></Field>
            <Field label="Rate 3"><NumberInput value={rates[2]} onChange={(v) => setRate(2, v)} suffix={settings.currency} min={0} /></Field>
          </div>
          <p className="tiny faint" style={{ marginTop: 8 }}>
            Your hourly rate comes from these: rate ÷ {settings.regularDayHours}h. Overtime,
            night hours and everything else are worked out from it.
          </p>
        </div>

        <div className="card">
          <CardHead title="Run of the job" />
          <div className="field-row">
            <Field label="Starts">
              <input className="input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </Field>
            <Field label="Ends">
              <input className="input" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </Field>
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="Note"><TextInput value={note} onChange={setNote} placeholder="Contact, call sheet, anything" /></Field>
          </div>
        </div>

        <div className="card">
          <CardHead title="Colour" />
          <div className="swatches">
            {PRODUCTION_COLORS.map((c) => (
              <button
                key={c} type="button" className={`swatch ${c === color ? 'on' : ''}`}
                style={{ background: c }} onClick={() => setColor(c)} aria-label={`Colour ${c}`}
              />
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <Toggle
              checked={makeDefault} onChange={setMakeDefault}
              title="Use as my current job"
              desc="New days and the clock-in button default to it."
            />
          </div>
        </div>

        <button className="btn primary block lg" onClick={save}>
          {initial ? 'Save job' : 'Add job'}
        </button>
      </div>
    </Sheet>
  )
}

/** Pencil a run of dates into the diary for one job. */
function BookingSheet({ production, onClose }: { production: Production; onClose: () => void }) {
  const store = useStore()
  const today = todayISO()
  const [from, setFrom] = useState(production.startsOn && production.startsOn > today ? production.startsOn : today)
  const [to, setTo] = useState(production.startsOn && production.startsOn > today ? production.startsOn : today)
  const [skipRestDays, setSkipRestDays] = useState(true)

  const dates = useMemo(() => {
    if (!from || !to || to < from) return []
    const out: string[] = []
    for (let d = from; d <= to && out.length < 200; d = addDays(d, 1)) out.push(d)
    return out.filter((d) => !skipRestDays || new Date(d + 'T00:00:00').getDay() !== store.settings.restDay)
  }, [from, to, skipRestDays, store.settings.restDay])

  const apply = (booked: boolean) => {
    for (const d of dates) {
      store.setDay(d, booked ? { booked: true, productionId: production.id } : { booked: false })
    }
    onClose()
  }

  return (
    <Sheet title={`Book days — ${production.name}`} onClose={onClose}>
      <div className="stack">
        <div className="card">
          <div className="field-row">
            <Field label="From">
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <Toggle
              checked={skipRestDays} onChange={setSkipRestDays}
              title="Skip rest days" desc="Leave the weekly rest day out of the block."
            />
          </div>
        </div>

        <div className="card" style={{ background: 'var(--surface-2)' }}>
          <div className="inline between">
            <span className="inline"><IconBoat size={17} /><b>{dates.length}</b>
              <span className="tiny muted">day{dates.length === 1 ? '' : 's'} selected</span></span>
            <span className="num">
              {money(dates.length * production.rates[0], store.settings, { decimals: 0 })}
            </span>
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            Booked days show up as pipeline, not earnings. Open a day and switch on
            “I worked this day” once it actually happens.
          </p>
        </div>

        <button className="btn primary block lg" onClick={() => apply(true)} disabled={!dates.length}>
          Book {dates.length} day{dates.length === 1 ? '' : 's'}
        </button>
        <button className="btn ghost block" onClick={() => apply(false)} disabled={!dates.length}>
          Clear the booking instead
        </button>
      </div>
    </Sheet>
  )
}
