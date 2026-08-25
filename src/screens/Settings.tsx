import { useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { defaultData } from '../lib/defaults'
import { copyText, exportJSON, importJSON } from '../lib/storage'
import { describeOutcome, saveFile } from '../lib/downloads'
import { overtimePay } from '../lib/pay'
import { money } from '../lib/format'
import { todayISO, DAY_NAMES, formatHM } from '../lib/time'
import type { ThemeChoice } from '../types'
import {
  Card, CardHead, Field, NumberInput, Segmented, Select, TextInput, Toggle,
} from '../components/ui'
import {
  IconAlert, IconCar, IconChevronDown, IconClock, IconCoins, IconCopy, IconDownload,
  IconMoon, IconSettings, IconSun, IconUpload, IconCamera, IconFood, Logo,
} from '../components/Icons'

/** A section that starts closed, so the page isn't a wall of inputs. */
function Fold({
  title, sub, icon, children, open: initiallyOpen = false,
}: { title: string; sub?: string; icon?: React.ReactNode; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <Card>
      <button className="fold-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {icon && <span className="fold-icon">{icon}</span>}
        <span className="fold-text">
          <span className="fold-title">{title}</span>
          {sub && <span className="fold-sub">{sub}</span>}
        </span>
        <IconChevronDown
          size={18}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flex: 'none' }}
        />
      </button>
      {open && <div className="fold-body">{children}</div>}
    </Card>
  )
}

export function Settings() {
  const store = useStore()
  const { settings } = store
  const set = store.setSettings
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)

  const setMe = (patch: Partial<typeof settings.me>) => set({ me: { ...settings.me, ...patch } })

  const onImport = async (file: File) => {
    try {
      store.replaceAll(importJSON(await file.text()))
      setMessage('Backup restored.')
    } catch {
      setMessage('That file could not be read.')
    }
  }

  return (
    <>
      <div className="hero" style={{ background: 'linear-gradient(135deg,#0e7c86 0%,#06373f 100%)' }}>
        <div className="hero-top">
          <div className="hero-brand">
            <span className="hero-mark"><IconSettings size={19} /></span>
            <div>
              <div className="hero-title">Settings</div>
              <div className="hero-sub">Everything here is yours to change</div>
            </div>
          </div>
        </div>
      </div>

      <PayCard />

      <div className="section-title">Everyday</div>

      <Card>
        <CardHead title="Monthly goal" sub="The bar on your home screen" />
        <NumberInput value={settings.monthlyGoal} onChange={(v) => set({ monthlyGoal: v })}
          suffix={settings.currency} min={0} />
      </Card>

      <Card>
        <CardHead title="Look" />
        <Segmented<ThemeChoice>
          value={settings.theme} onChange={(v) => set({ theme: v })}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'light', label: 'Daylight' },
            { value: 'dark', label: 'Sunset' },
          ]}
        />
        <div className="inline tiny muted" style={{ marginTop: 10, gap: 12 }}>
          <span className="inline" style={{ gap: 5 }}><IconSun size={14} /> Bleached sand</span>
          <span className="inline" style={{ gap: 5 }}><IconMoon size={14} /> Deep water</span>
        </div>
      </Card>

      <Card>
        <CardHead title="Money & tax" />
        <div className="stack tight">
          <div className="field-row">
            <Field label="Currency symbol">
              <TextInput value={settings.currency} onChange={(v) => set({ currency: v })} maxLength={3} />
            </Field>
            <Field label="Code">
              <TextInput value={settings.currencyCode} onChange={(v) => set({ currencyCode: v })} maxLength={4} />
            </Field>
          </div>
          <Toggle checked={settings.chargeVat} onChange={(v) => set({ chargeVat: v })}
            title="Add VAT to invoices" desc="Turn off if you invoice without it." />
          {settings.chargeVat && (
            <Field label="VAT rate">
              <NumberInput value={Math.round(settings.vatRate * 1000) / 10}
                onChange={(v) => set({ vatRate: v / 100 })} suffix="%" min={0} />
            </Field>
          )}
          <Field label="Set aside for income tax" hint="Taken off before the app tells you what you kept.">
            <NumberInput value={Math.round(settings.taxSetAside * 1000) / 10}
              onChange={(v) => set({ taxSetAside: v / 100 })} suffix="%" min={0} />
          </Field>
        </div>
      </Card>

      <div className="section-title">Your pay rules</div>

      <Fold
        title="The working day"
        sub={`${formatHM(settings.regularDayHours)} normal · ${formatHM(settings.eveDayHours)} on a ${DAY_NAMES[settings.eveDay].slice(0, 3)}`}
        icon={<IconClock size={18} />}
      >
        <div className="stack tight">
          <div className="field-row">
            <Field label="Hours the day rate covers">
              <NumberInput value={settings.regularDayHours} onChange={(v) => set({ regularDayHours: v })}
                suffix="h" step={0.5} min={1} />
            </Field>
            <Field label="On a rest-day eve">
              <NumberInput value={settings.eveDayHours} onChange={(v) => set({ eveDayHours: v })}
                suffix="h" step={0.5} min={1} />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Rest day pays">
              <NumberInput value={settings.restDayMultiplier} onChange={(v) => set({ restDayMultiplier: v })}
                suffix="×" step={0.1} min={1} />
            </Field>
            <Field label="Rest-day eve bonus" hint="Only if you worked the whole week before it.">
              <NumberInput value={settings.eveDayBonusMultiplier} onChange={(v) => set({ eveDayBonusMultiplier: v })}
                suffix="×" step={0.1} min={1} />
            </Field>
          </div>
          <div className="field-row three">
            <Field label="Week starts">
              <Select value={settings.weekStartsOn} onChange={(v) => set({ weekStartsOn: v })}
                options={DAY_NAMES.map((d, i) => ({ value: i, label: d.slice(0, 3) }))} />
            </Field>
            <Field label="Rest day">
              <Select value={settings.restDay} onChange={(v) => set({ restDay: v })}
                options={DAY_NAMES.map((d, i) => ({ value: i, label: d.slice(0, 3) }))} />
            </Field>
            <Field label="Its eve">
              <Select value={settings.eveDay} onChange={(v) => set({ eveDay: v })}
                options={DAY_NAMES.map((d, i) => ({ value: i, label: d.slice(0, 3) }))} />
            </Field>
          </div>
          <Field label="Rest day starts at" hint={`Hours past this on a ${DAY_NAMES[settings.eveDay]} pay ${settings.restDayMultiplier}×.`}>
            <input className="input" type="time" value={settings.restDayStartsAt}
              onChange={(e) => set({ restDayStartsAt: e.target.value })} />
          </Field>
        </div>
      </Fold>

      <Fold
        title="Overtime"
        sub={`${settings.overtimeFirstMultiplier}× to hour 12, then climbing`}
        icon={<IconCoins size={18} />}
      >
        <div className="stack tight">
          <div className="field-row">
            <Field label="Up to hour 12">
              <NumberInput value={settings.overtimeFirstMultiplier}
                onChange={(v) => set({ overtimeFirstMultiplier: v })} suffix="×" step={0.1} min={1} />
            </Field>
            <Field label="Climb per hour past 13">
              <NumberInput value={settings.overtimeStep} onChange={(v) => set({ overtimeStep: v })}
                suffix="×" step={0.1} min={0} />
            </Field>
          </div>
          <p className="tiny muted">
            Hours 12 to 13 always pay 2×. Past hour 13 the rate starts at 2.5× and climbs
            {' '}{settings.overtimeStep}× for every further hour.
          </p>
          <Field label="Weekly hour quota" hint="Hours past this in one week add an overage charge.">
            <NumberInput value={settings.weeklyQuotaHours} onChange={(v) => set({ weeklyQuotaHours: v })}
              suffix="h" min={0} />
          </Field>
        </div>
      </Fold>

      <Fold
        title="Night & rest between days"
        sub={`Night ${settings.nightStart}–${settings.nightEnd} · ${settings.minTurnaroundHours}h turnaround`}
        icon={<IconMoon size={18} />}
      >
        <div className="stack tight">
          <div className="field-row three">
            <Field label="Night from">
              <input className="input" type="time" value={settings.nightStart}
                onChange={(e) => set({ nightStart: e.target.value })} />
            </Field>
            <Field label="Night until">
              <input className="input" type="time" value={settings.nightEnd}
                onChange={(e) => set({ nightEnd: e.target.value })} />
            </Field>
            <Field label="Premium">
              <NumberInput value={Math.round(settings.nightRate * 100)}
                onChange={(v) => set({ nightRate: v / 100 })} suffix="%" min={0} />
            </Field>
          </div>
          <Field label="Minimum turnaround" hint="Rest between two work days. Less than this is charged.">
            <NumberInput value={settings.minTurnaroundHours} onChange={(v) => set({ minTurnaroundHours: v })}
              suffix="h" step={0.5} min={0} />
          </Field>
          <div className="field-row">
            <Field label="Short weekend rest">
              <NumberInput value={settings.weekendRestShortHours}
                onChange={(v) => set({ weekendRestShortHours: v })} suffix="h" min={0} />
            </Field>
            <Field label="Long weekend rest">
              <NumberInput value={settings.weekendRestLongHours}
                onChange={(v) => set({ weekendRestLongHours: v })} suffix="h" min={0} />
            </Field>
          </div>
        </div>
      </Fold>

      <Fold
        title="Travel rings"
        sub={settings.ringFees.some((f) => f > 0) ? 'Set up' : 'All zero — set your fees'}
        icon={<IconCar size={18} />}
      >
        <div className="ring-grid">
          {settings.ringFees.map((fee, i) => (
            <Field key={i} label={`Ring ${i + 1}`}>
              <NumberInput
                value={fee}
                onChange={(v) => set({ ringFees: settings.ringFees.map((x, j) => (j === i ? v : x)) })}
                suffix={settings.currency} min={0}
              />
            </Field>
          ))}
        </div>
        <p className="tiny faint" style={{ marginTop: 10 }}>
          Rings 2 and up also add rest before the turnaround clock starts:
          1h for ring 2, 1h30 for 3–4, 2h for 5–6, 3h for ring 7.
        </p>
      </Fold>

      <div className="section-title">You</div>

      <Fold title="Details on your invoices" sub={settings.me.name || 'Not filled in yet'} icon={<IconFood size={18} />}>
        <div className="stack tight">
          <div className="field-row">
            <Field label="Name"><TextInput value={settings.me.name} onChange={(v) => setMe({ name: v })} /></Field>
            <Field label="Role"><TextInput value={settings.me.role} onChange={(v) => setMe({ role: v })} /></Field>
          </div>
          <div className="field-row">
            <Field label="Business / tax ID">
              <TextInput value={settings.me.businessId} onChange={(v) => setMe({ businessId: v })} />
            </Field>
            <Field label="Phone"><TextInput value={settings.me.phone} onChange={(v) => setMe({ phone: v })} /></Field>
          </div>
          <Field label="Email"><TextInput value={settings.me.email} onChange={(v) => setMe({ email: v })} /></Field>
          <Field label="Address"><TextInput value={settings.me.address} onChange={(v) => setMe({ address: v })} /></Field>
          <Field label="Payment details" hint="Bank or transfer details for the invoice footer.">
            <textarea className="input" rows={2} value={settings.me.bank}
              onChange={(e) => setMe({ bank: e.target.value })} />
          </Field>
          <Field label="Next invoice number">
            <NumberInput value={settings.invoiceCounter}
              onChange={(v) => set({ invoiceCounter: Math.max(1, Math.round(v)) })} min={1} step={1} />
          </Field>
        </div>
      </Fold>

      <Card>
        <CardHead title="Your data" sub="It lives on this device only." />
        <div className="inline" style={{ gap: 8 }}>
          <button
            className="btn sm"
            onClick={async () => {
              const outcome = await saveFile(`ombak-backup-${todayISO()}.json`, exportJSON(store.data))
              setMessage(describeOutcome(outcome, 'Backup'))
            }}
          >
            <IconDownload size={15} /> Back up
          </button>
          <button
            className="btn sm"
            onClick={async () => {
              setMessage(await copyText(exportJSON(store.data))
                ? 'Backup copied — paste it somewhere safe.'
                : 'Could not reach the clipboard.')
            }}
          >
            <IconCopy size={15} /> Copy backup
          </button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>
            <IconUpload size={15} /> Restore
          </button>
          <input
            ref={fileRef} type="file" accept="application/json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = '' }}
          />
        </div>
        {message && <p className="tiny" style={{ marginTop: 10, color: 'var(--accent-ink)' }}>{message}</p>}
        <hr className="hr" />
        <button
          className="btn danger sm"
          onClick={() => {
            if (confirm('Erase every day, expense and job on this device? This cannot be undone.')) {
              store.replaceAll(defaultData())
              setMessage('Everything cleared.')
            }
          }}
        >
          <IconAlert size={15} /> Erase everything
        </button>
        <p className="tiny faint" style={{ marginTop: 10 }}>
          Nothing is uploaded anywhere. Back up before you clear app data or change phone.
        </p>
      </Card>

      <Card>
        <div className="inline" style={{ gap: 10 }}>
          <Logo size={30} style={{ borderRadius: 9, flex: 'none' }} />
          <div>
            <b>Ombak</b>
            <div className="tiny muted">Indonesian for “wave”. Works with no signal.</div>
          </div>
        </div>
      </Card>
    </>
  )
}

/**
 * The number people come to Settings looking for. It edits the day rates on the
 * job you are currently working, right here, and shows what they buy.
 */
function PayCard() {
  const store = useStore()
  const { settings } = store
  const jobs = store.data.productions.filter((p) => !p.archived)
  const current = store.productionOf(settings.defaultProductionId) ?? jobs[0]
  const [showAll, setShowAll] = useState(false)

  const preview = useMemo(() => {
    if (!current) return null
    const rate = current.rates[0]
    const quota = settings.regularDayHours
    const hourly = quota > 0 ? rate / quota : 0
    return {
      hourly,
      oneHourOver: overtimePay(1, quota, hourly, settings),
      restDay: rate * settings.restDayMultiplier,
    }
  }, [current, settings])

  if (!current) {
    return (
      <Card>
        <CardHead title="Your day rate" sub="Add a job first, on the Jobs tab." />
      </Card>
    )
  }

  const setRate = (i: number, v: number) =>
    store.updateProduction(current.id, {
      rates: current.rates.map((x, j) => (j === i ? v : x)) as [number, number, number],
    })

  return (
    <Card className="pay-card">
      <div className="pay-head">
        <div>
          <div className="pay-label">What I get for a day</div>
          <div className="tiny muted">{current.name}</div>
        </div>
        {jobs.length > 1 && (
          <select
            className="input pay-job"
            value={current.id}
            onChange={(e) => store.setSettings({ defaultProductionId: e.target.value })}
          >
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        )}
      </div>

      <div className="pay-input">
        <span className="pay-currency">{settings.currency}</span>
        <input
          className="pay-number" type="number" inputMode="decimal" min={0} step={10}
          value={String(current.rates[0])}
          onChange={(e) => setRate(0, e.target.value === '' ? 0 : Number(e.target.value))}
          aria-label="Day rate"
        />
        <span className="pay-per">a day</span>
      </div>

      <div className="pay-quick">
        {[750, 800, 850, 900, 950, 1050].map((v) => (
          <button
            key={v} type="button"
            className={`pay-chip ${current.rates[0] === v ? 'on' : ''}`}
            onClick={() => setRate(0, v)}
          >
            {settings.currency}{v}
          </button>
        ))}
      </div>

      {preview && (
        <div className="pay-facts">
          <div><span className="k">That is</span><span className="v">{money(preview.hourly, settings)}/h</span></div>
          <div><span className="k">1h overtime</span><span className="v">{money(preview.oneHourOver, settings)}</span></div>
          <div><span className="k">A rest day</span><span className="v">{money(preview.restDay, settings)}</span></div>
        </div>
      )}

      <button className="btn ghost block sm" onClick={() => setShowAll((s) => !s)} style={{ marginTop: 12 }}>
        {showAll ? 'Hide the other two rates' : 'I have more than one rate'}
        <IconChevronDown size={15} style={{ transform: showAll ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>

      {showAll && (
        <div className="field-row" style={{ marginTop: 12 }}>
          <Field label="Rate 2">
            <NumberInput value={current.rates[1]} onChange={(v) => setRate(1, v)} suffix={settings.currency} min={0} />
          </Field>
          <Field label="Rate 3">
            <NumberInput value={current.rates[2]} onChange={(v) => setRate(2, v)} suffix={settings.currency} min={0} />
          </Field>
        </div>
      )}

      <p className="tiny faint" style={{ marginTop: 10 }}>
        <IconCamera size={13} /> Each job has its own rates. Change them here or on the Jobs tab.
      </p>
    </Card>
  )
}
