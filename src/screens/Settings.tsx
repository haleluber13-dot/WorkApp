import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import { defaultData } from '../lib/defaults'
import { download, exportJSON, importJSON } from '../lib/storage'
import { todayISO, DAY_NAMES } from '../lib/time'
import type { ThemeChoice } from '../types'
import { Card, CardHead, Field, NumberInput, Segmented, Select, TextInput, Toggle } from '../components/ui'
import {
  IconAlert, IconCar, IconDownload, IconMoon, IconSettings,
  IconSun, IconUpload, IconWave,
} from '../components/Icons'

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
              <div className="hero-sub">Make the maths match your deal</div>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHead title="Look & feel" />
        <Field label="Theme">
          <Segmented<ThemeChoice>
            value={settings.theme} onChange={(v) => set({ theme: v })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'light', label: 'Daylight' },
              { value: 'dark', label: 'Sunset' },
            ]}
          />
        </Field>
        <div className="inline tiny muted" style={{ marginTop: 10, gap: 12 }}>
          <span className="inline" style={{ gap: 5 }}><IconSun size={14} /> Bleached sand</span>
          <span className="inline" style={{ gap: 5 }}><IconMoon size={14} /> Deep water</span>
        </div>
      </Card>

      <Card>
        <CardHead title="Money" />
        <div className="stack tight">
          <div className="field-row">
            <Field label="Currency symbol"><TextInput value={settings.currency} onChange={(v) => set({ currency: v })} maxLength={3} /></Field>
            <Field label="Code"><TextInput value={settings.currencyCode} onChange={(v) => set({ currencyCode: v })} maxLength={4} /></Field>
          </div>
          <Field label="Monthly goal" hint="Shown as a progress bar on the home screen.">
            <NumberInput value={settings.monthlyGoal} onChange={(v) => set({ monthlyGoal: v })} suffix={settings.currency} min={0} />
          </Field>
          <Toggle checked={settings.chargeVat} onChange={(v) => set({ chargeVat: v })}
            title="Charge VAT" desc="Turn off if you invoice without it." />
          {settings.chargeVat && (
            <Field label="VAT rate">
              <NumberInput value={Math.round(settings.vatRate * 1000) / 10}
                onChange={(v) => set({ vatRate: v / 100 })} suffix="%" min={0} />
            </Field>
          )}
          <Field label="Set aside for income tax" hint="Skimmed off before the app tells you what you kept.">
            <NumberInput value={Math.round(settings.taxSetAside * 1000) / 10}
              onChange={(v) => set({ taxSetAside: v / 100 })} suffix="%" min={0} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHead title="The working day" sub="How many hours the day rate buys." />
        <div className="stack tight">
          <div className="field-row">
            <Field label="Normal day">
              <NumberInput value={settings.regularDayHours} onChange={(v) => set({ regularDayHours: v })} suffix="h" step={0.5} min={1} />
            </Field>
            <Field label="Rest-day eve">
              <NumberInput value={settings.eveDayHours} onChange={(v) => set({ eveDayHours: v })} suffix="h" step={0.5} min={1} />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Rest day pays">
              <NumberInput value={settings.restDayMultiplier} onChange={(v) => set({ restDayMultiplier: v })} suffix="×" step={0.1} min={1} />
            </Field>
            <Field label="Full-week eve bonus" hint="Applied when you worked every day before it.">
              <NumberInput value={settings.eveDayBonusMultiplier} onChange={(v) => set({ eveDayBonusMultiplier: v })} suffix="×" step={0.1} min={1} />
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
          <Field label="Rest day starts at" hint="Hours past this on the eve pay the rest-day multiple.">
            <input className="input" type="time" value={settings.restDayStartsAt}
              onChange={(e) => set({ restDayStartsAt: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHead title="Overtime" sub="The ladder past the day quota." />
        <div className="stack tight">
          <div className="field-row">
            <Field label="Up to hour 12">
              <NumberInput value={settings.overtimeFirstMultiplier}
                onChange={(v) => set({ overtimeFirstMultiplier: v })} suffix="×" step={0.1} min={1} />
            </Field>
            <Field label="Climb per hour past 13">
              <NumberInput value={settings.overtimeStep} onChange={(v) => set({ overtimeStep: v })} suffix="×" step={0.1} min={0} />
            </Field>
          </div>
          <p className="tiny muted">
            Hours 12 to 13 always pay 2×. Past 13 the rate starts at 2.5× and climbs
            {' '}{settings.overtimeStep}× for every further hour.
          </p>
          <Field label="Weekly hour quota" hint="Hours past this in one week add an overage charge.">
            <NumberInput value={settings.weeklyQuotaHours} onChange={(v) => set({ weeklyQuotaHours: v })} suffix="h" min={0} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHead title="Night & rest" />
        <div className="stack tight">
          <div className="field-row three">
            <Field label="Night from">
              <input className="input" type="time" value={settings.nightStart} onChange={(e) => set({ nightStart: e.target.value })} />
            </Field>
            <Field label="Night until">
              <input className="input" type="time" value={settings.nightEnd} onChange={(e) => set({ nightEnd: e.target.value })} />
            </Field>
            <Field label="Premium">
              <NumberInput value={Math.round(settings.nightRate * 100)} onChange={(v) => set({ nightRate: v / 100 })} suffix="%" min={0} />
            </Field>
          </div>
          <Field label="Minimum turnaround" hint="Rest between two work days. Less than this is charged.">
            <NumberInput value={settings.minTurnaroundHours} onChange={(v) => set({ minTurnaroundHours: v })} suffix="h" step={0.5} min={0} />
          </Field>
          <div className="field-row">
            <Field label="Short weekend rest">
              <NumberInput value={settings.weekendRestShortHours} onChange={(v) => set({ weekendRestShortHours: v })} suffix="h" min={0} />
            </Field>
            <Field label="Long weekend rest">
              <NumberInput value={settings.weekendRestLongHours} onChange={(v) => set({ weekendRestLongHours: v })} suffix="h" min={0} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Travel rings" sub="What each ring pays, per leg." />
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
          <IconCar size={13} /> Rings 2 and up also add rest before the turnaround clock starts:
          1h for ring 2, 1h30 for 3–4, 2h for 5–6, 3h for ring 7.
        </p>
      </Card>

      <Card>
        <CardHead title="Your details" sub="Printed on invoices." />
        <div className="stack tight">
          <div className="field-row">
            <Field label="Name"><TextInput value={settings.me.name} onChange={(v) => setMe({ name: v })} /></Field>
            <Field label="Role"><TextInput value={settings.me.role} onChange={(v) => setMe({ role: v })} /></Field>
          </div>
          <div className="field-row">
            <Field label="Business / tax ID"><TextInput value={settings.me.businessId} onChange={(v) => setMe({ businessId: v })} /></Field>
            <Field label="Phone"><TextInput value={settings.me.phone} onChange={(v) => setMe({ phone: v })} /></Field>
          </div>
          <Field label="Email"><TextInput value={settings.me.email} onChange={(v) => setMe({ email: v })} /></Field>
          <Field label="Address"><TextInput value={settings.me.address} onChange={(v) => setMe({ address: v })} /></Field>
          <Field label="Payment details" hint="Bank or transfer details for the invoice footer.">
            <textarea className="input" rows={2} value={settings.me.bank}
              onChange={(e) => setMe({ bank: e.target.value })} />
          </Field>
          <Field label="Next invoice number">
            <NumberInput value={settings.invoiceCounter} onChange={(v) => set({ invoiceCounter: Math.max(1, Math.round(v)) })} min={1} step={1} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHead title="Your data" sub="It lives on this device only." />
        <div className="inline" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => download(`ombak-backup-${todayISO()}.json`, exportJSON(store.data))}>
            <IconDownload size={15} /> Back up
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
          Nothing is uploaded anywhere. Back up before you clear browser data or change phone.
        </p>
      </Card>

      <Card>
        <div className="inline" style={{ gap: 10 }}>
          <IconWave size={20} />
          <div>
            <b>Ombak</b>
            <div className="tiny muted">Indonesian for “wave”. Works offline — add it to your home screen.</div>
          </div>
        </div>
      </Card>
    </>
  )
}
