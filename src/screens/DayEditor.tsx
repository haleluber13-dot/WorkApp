import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { computeRange } from '../lib/pay'
import type { Tariff } from '../types'
import { money } from '../lib/format'
import { addDays, formatDuration, formatHM, prettyDateLong, dayOfWeek } from '../lib/time'
import { Field, NumberInput, Segmented, Select, Sheet, TextInput, Toggle } from '../components/ui'
import { PlaceField } from '../components/PlaceField'
import {
  IconAlert, IconCar, IconChevronDown, IconChevronLeft, IconChevronRight, IconClock,
  IconFood, IconMoon, IconNote, IconPin, IconSparkle, IconTrash,
} from '../components/Icons'

const TARIFFS: { value: Tariff; label: string }[] = [
  { value: 1, label: 'Rate 1' },
  { value: 2, label: 'Rate 2' },
  { value: 3, label: 'Rate 3' },
]

const RINGS = [
  { value: 0, label: 'None' }, { value: 1, label: 'Ring 1' }, { value: 2, label: 'Ring 2' },
  { value: 3, label: 'Ring 3' }, { value: 4, label: 'Ring 4' }, { value: 5, label: 'Ring 5' },
  { value: 6, label: 'Ring 6' }, { value: 7, label: 'Ring 7' },
]

const QUARTERS = [
  { value: 0, label: 'On time' }, { value: 0.25, label: '15 min' }, { value: 0.5, label: '30 min' },
  { value: 0.75, label: '45 min' }, { value: 1, label: '1 h' }, { value: 1.5, label: '1 h 30' },
  { value: 2, label: '2 h' }, { value: 2.5, label: '2 h 30' }, { value: 3, label: '3 h' },
]

export function DayEditor({ date, onClose, onGoToDate }: {
  date: string
  onClose: () => void
  onGoToDate?: (next: string) => void
}) {
  const store = useStore()
  const { settings } = store
  const day = store.getDay(date)
  const [showExtras, setShowExtras] = useState(
    day.breakfastSkipped || day.lunchLateH > 0 || day.thirdMealLateH > 0 ||
    day.mealsShortH > 0 || day.ringOut > 0 || day.ringBack > 0 || day.misc !== 0,
  )

  // Price the day live, in the context of its neighbours.
  const pay = useMemo(() => computeRange(date, date, store.data).get(date)!, [date, store.data])

  const set = (patch: Parameters<typeof store.setDay>[1]) => store.setDay(date, patch)
  const isRestDay = dayOfWeek(date) === settings.restDay
  const isEveDay = dayOfWeek(date) === settings.eveDay

  const lines: { label: string; value: number; tone?: string }[] = [
    { label: 'Day rate', value: pay.dayFee },
    { label: 'Overtime', value: pay.overtimePay },
    { label: 'Night hours', value: pay.nightPay },
    { label: 'Meals & breaks', value: pay.mealPay },
    { label: 'Travel rings', value: pay.ringPay },
    { label: 'Short turnaround', value: pay.turnaroundPay },
    { label: 'Rest-day hours', value: pay.restDayPay },
    { label: 'Weekly quota', value: pay.weeklyOveragePay },
    { label: 'Weekend rest', value: pay.weekendRestPay },
    { label: 'Adjustment', value: pay.misc },
  ].filter((l) => Math.abs(l.value) > 0.005)

  return (
    <Sheet
      title={prettyDateLong(date)}
      onClose={onClose}
      action={
        store.data.days[date] ? (
          <button
            className="btn ghost sm" aria-label="Clear this day"
            onClick={() => { store.clearDay(date); onClose() }}
          ><IconTrash size={17} /></button>
        ) : undefined
      }
    >
      <div className="stack">
        {onGoToDate && (
          <div className="card">
            <div className="date-jump">
              <button className="hero-nav-btn" onClick={() => onGoToDate(addDays(date, -1))} aria-label="Previous day">
                <IconChevronLeft size={18} />
              </button>
              <input
                className="input" type="date" value={date}
                onChange={(e) => e.target.value && onGoToDate(e.target.value)}
                aria-label="Date"
              />
              <button className="hero-nav-btn" onClick={() => onGoToDate(addDays(date, 1))} aria-label="Next day">
                <IconChevronRight size={18} />
              </button>
            </div>
            <p className="tiny faint" style={{ marginTop: 8 }}>
              Any date works — step back to fill in a day you missed.
            </p>
          </div>
        )}

        <div className="card">
          <div className="stack tight">
            <Toggle
              checked={day.worked}
              onChange={(v) => set({ worked: v, booked: v ? false : day.booked })}
              title="I worked this day"
              desc={isRestDay ? `Rest day — pays ${settings.restDayMultiplier}× the day rate`
                : isEveDay ? 'Rest-day eve — a shorter paid day' : 'Counts as a paid day'}
            />
            {!day.worked && (
              <Toggle
                checked={day.booked}
                onChange={(v) => set({ booked: v })}
                title="Pencilled in"
                desc="Booked for a job but not worked yet — counts as pipeline."
              />
            )}
          </div>
        </div>

        {!day.worked && day.booked && (
          <div className="card">
            <Field label="Job">
              <Select
                value={day.productionId ?? ''}
                onChange={(v) => set({ productionId: v || null })}
                options={[
                  { value: '', label: '— none —' },
                  ...store.data.productions.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </Field>
          </div>
        )}

        {day.worked && (
          <>
            <div className="card">
              <div className="stack tight">
                <Field label="Job">
                  <Select
                    value={day.productionId ?? ''}
                    onChange={(v) => set({ productionId: v || null })}
                    options={[
                      { value: '', label: '— none —' },
                      ...store.data.productions.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                </Field>

                <Field label="Rate step" hint="Which of the production's three day rates applies.">
                  <Segmented value={day.tariff} onChange={(v) => set({ tariff: v })} options={TARIFFS} />
                </Field>

                <div className="field-row">
                  <Field label="Start">
                    <input
                      className="input" type="time" value={day.start ?? ''}
                      onChange={(e) => set({ start: e.target.value || null })}
                    />
                  </Field>
                  <Field label="End" hint="Earlier than the start means it ran past midnight.">
                    <input
                      className="input" type="time" value={day.end ?? ''}
                      onChange={(e) => set({ end: e.target.value || null })}
                    />
                  </Field>
                </div>

                <Toggle
                  checked={day.partialDay}
                  onChange={(v) => set({ partialDay: v })}
                  title="Short day"
                  desc="Bill a fraction of the day rate instead of the whole thing."
                />
              </div>
            </div>

            <div className="card">
              <div className="card-head"><IconPin size={17} /><h3>Location</h3></div>
              <PlaceField place={day.place} onChange={(place) => set({ place })} />
            </div>

            {/* Live summary */}
            <div className="card" style={{ background: 'var(--surface-2)' }}>
              <div className="inline between" style={{ marginBottom: 10 }}>
                <span className="inline"><IconClock size={17} /><b>{formatDuration(pay.hours)}</b>
                  <span className="tiny muted">on the clock</span></span>
                <span className="num" style={{ fontSize: 22 }}>{money(pay.total, settings)}</span>
              </div>

              <div className="inline" style={{ gap: 6, marginBottom: 10 }}>
                <span className="chip">Quota {formatHM(pay.quota)}</span>
                {pay.overtimeHours > 0 && <span className="chip warm">OT {formatHM(pay.overtimeHours)}</span>}
                {pay.nightHours > 0 && <span className="chip accent"><IconMoon size={12} /> {formatHM(pay.nightHours)}</span>}
                {pay.turnaroundShortfall > 0 && (
                  <span className="chip bad"><IconAlert size={12} /> Turnaround −{formatHM(pay.turnaroundShortfall)}</span>
                )}
                {pay.weekendRestShortfall > 0 && (
                  <span className="chip bad">Weekend rest −{formatHM(pay.weekendRestShortfall)}</span>
                )}
              </div>

              <div className="legend">
                {lines.map((l) => (
                  <div key={l.label} className="legend-item">
                    <span className="muted">{l.label}</span>
                    <span className="amt">{money(l.value, settings)}</span>
                  </div>
                ))}
              </div>

              {pay.turnaroundShortfall > 0 && (
                <p className="tiny muted" style={{ marginTop: 10 }}>
                  You had {formatHM(pay.turnaroundGap)} of rest before this day, {formatHM(pay.turnaroundShortfall)} under
                  the {settings.minTurnaroundHours}h minimum. That shortfall is charged on top.
                </p>
              )}
            </div>

            <button className="btn ghost block" onClick={() => setShowExtras((s) => !s)}>
              <IconSparkle size={16} />
              {showExtras ? 'Hide extras' : 'Meals, travel & adjustments'}
              <IconChevronDown size={16} style={{ transform: showExtras ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
            </button>

            {showExtras && (
              <>
                <div className="card">
                  <div className="card-head"><IconFood size={17} /><h3>Meals & breaks</h3></div>
                  <div className="stack tight">
                    <Toggle
                      checked={day.breakfastSkipped}
                      onChange={(v) => set({ breakfastSkipped: v })}
                      title="Breakfast skipped"
                      desc="Adds a quarter of an hour at your hourly rate."
                    />
                    <div className="field-row">
                      <Field label="Lunch late by">
                        <Select value={day.lunchLateH} onChange={(v) => set({ lunchLateH: v })} options={QUARTERS} />
                      </Field>
                      <Field label="Third meal late by">
                        <Select value={day.thirdMealLateH} onChange={(v) => set({ thirdMealLateH: v })} options={QUARTERS} />
                      </Field>
                    </div>
                    <Field label="Meals cut short by" hint="Counted at double.">
                      <Select value={day.mealsShortH} onChange={(v) => set({ mealsShortH: v })} options={QUARTERS} />
                    </Field>
                  </div>
                </div>

                <div className="card">
                  <div className="card-head"><IconCar size={17} /><h3>Travel rings</h3></div>
                  <div className="field-row">
                    <Field label="Out">
                      <Select value={day.ringOut} onChange={(v) => set({ ringOut: v })} options={RINGS} />
                    </Field>
                    <Field label="Back">
                      <Select value={day.ringBack} onChange={(v) => set({ ringBack: v })} options={RINGS} />
                    </Field>
                  </div>
                  <p className="tiny faint" style={{ marginTop: 8 }}>
                    Ring fees are set in Settings. A bigger ring also buys extra rest before the turnaround clock starts.
                  </p>
                </div>

                <div className="card">
                  <div className="stack tight">
                    <Field label="Adjustment" hint="Anything else, positive or negative — a bonus, a deduction, a per diem.">
                      <NumberInput value={day.misc} onChange={(v) => set({ misc: v })} suffix={settings.currency} />
                    </Field>
                    {isEveDay && (
                      <Field label="Rest day starts at" hint={`Hours past this time pay ${settings.restDayMultiplier}×. Blank uses the default (${settings.restDayStartsAt}).`}>
                        <input
                          className="input" type="time" value={day.restDayStartsAt ?? ''}
                          onChange={(e) => set({ restDayStartsAt: e.target.value || null })}
                        />
                      </Field>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <div className="card">
          <div className="card-head"><IconNote size={17} /><h3>Note</h3></div>
          <TextInput
            value={day.note}
            onChange={(v) => set({ note: v })}
            placeholder="Location, scene, who you worked with…"
          />
        </div>

        <button className="btn primary block lg" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  )
}
