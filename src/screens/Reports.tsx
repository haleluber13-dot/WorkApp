import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { forecast, monthsWithData, outstanding, summariseJob, summariseMonth } from '../lib/stats'
import { money, moneyShort, percent } from '../lib/format'
import { addMonths, formatDuration, monthLabel, monthKey, prettyDate, todayISO } from '../lib/time'
import { monthToCSV, expensesToCSV } from '../lib/csv'
import { copyText, exportJSON } from '../lib/storage'
import { describeOutcome, saveFile } from '../lib/downloads'
import type { Payment, PaymentStatus } from '../types'
import {
  Card, CardHead, Empty, Field, NumberInput, Segmented, Select, Sheet, Stat, TextInput,
} from '../components/ui'
import { Columns, Donut } from '../components/charts'
import {
  IconChart, IconCoins, IconCopy, IconDownload, IconPlus, IconPrint, IconReceipt,
  IconTrash, IconCalendar, IconSparkle, IconClock,
} from '../components/Icons'

const STATUS: { value: PaymentStatus; label: string }[] = [
  { value: 'expected', label: 'Expected' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'paid', label: 'Paid' },
]

export function Reports({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const store = useStore()
  const { settings } = store
  const [tab, setTab] = useState<'overview' | 'invoice' | 'payments'>('overview')

  const summary = useMemo(() => summariseMonth(month, store.data), [month, store.data])
  const year = month.slice(0, 4)

  const yearMonths = useMemo(
    () => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`),
    [year],
  )
  const yearData = useMemo(
    () => yearMonths.map((m) => ({ key: m, ...summariseMonth(m, store.data) })),
    [yearMonths, store.data],
  )
  const yearGross = yearData.reduce((s, m) => s + m.gross, 0)
  const yearSpent = yearData.reduce((s, m) => s + m.spent, 0)
  const yearDays = yearData.reduce((s, m) => s + m.workedDays, 0)
  const yearHours = yearData.reduce((s, m) => s + m.hours, 0)

  const owed = useMemo(() => outstanding(store.data.payments), [store.data.payments])
  const ahead = useMemo(() => forecast(store.data, todayISO()), [store.data])

  return (
    <>
      <div className="hero" style={{ background: 'linear-gradient(135deg,#0a5b66 0%,#12a5a8 60%,#5fd8c4 100%)' }}>
        <div className="hero-top">
          <div className="hero-brand">
            <span className="hero-mark"><IconChart size={19} /></span>
            <div>
              <div className="hero-title">Reports</div>
              <div className="hero-sub">The year, the invoice, the money owed</div>
            </div>
          </div>
        </div>
        <div className="hero-body readout">
          <div className="label">{year} so far</div>
          <div className="value">{money(yearGross, settings, { decimals: 0 })}</div>
          <div className="meta">
            <span><b>{yearDays}</b> days</span>
            <span><b>{formatDuration(yearHours)}</b></span>
            <span>Spent <b>{moneyShort(yearSpent, settings)}</b></span>
          </div>
        </div>
      </div>

      <Segmented
        value={tab} onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'invoice', label: 'Invoice' },
          { value: 'payments', label: 'Owed' },
        ]}
      />

      {tab === 'overview' && (
        <div className="stack" style={{ marginTop: 14 }}>
          <div className="stats">
            <Stat icon={<IconCoins size={14} />} label="Earned" value={moneyShort(yearGross, settings)} tone="good" />
            <Stat icon={<IconCalendar size={14} />} label="Days" value={String(yearDays)} />
            <Stat icon={<IconClock size={14} />} label="Per day"
              value={yearDays ? moneyShort(yearGross / yearDays, settings) : '—'} tone="accent" />
            <Stat icon={<IconSparkle size={14} />} label="Booked" value={moneyShort(ahead.value, settings)}
              hint={`${ahead.bookedDays} days`} />
          </div>

          <Card>
            <CardHead title={`Earnings across ${year}`} sub="Before VAT" />
            <Columns
              data={yearData.map((m) => ({
                label: monthLabel(m.key).slice(0, 1),
                value: m.gross,
                tone: m.key === month ? 'sun' as const : 'sea' as const,
              }))}
              settings={settings} height={150}
            />
          </Card>

          <Card>
            <CardHead title="Month by month" />
            <div className="rows">
              {yearData.filter((m) => m.gross > 0 || m.spent > 0).map((m) => (
                <button key={m.key} className="row" onClick={() => setMonth(m.key)}>
                  <span className="row-lead filled"><IconCalendar size={18} /></span>
                  <span className="row-main">
                    <span className="row-title">{monthLabel(m.key)}</span>
                    <span className="row-sub">{m.workedDays} days · {formatDuration(m.hours)} · spent {moneyShort(m.spent, settings)}</span>
                  </span>
                  <span className="row-amount">
                    {money(m.gross, settings, { decimals: 0 })}
                    <span className="sub">keeps {moneyShort(m.net, settings)}</span>
                  </span>
                </button>
              ))}
            </div>
            {yearData.every((m) => m.gross === 0 && m.spent === 0) && (
              <Empty art="📊" title={`Nothing recorded in ${year}`} />
            )}
          </Card>

          <Card>
            <CardHead title="Where the money came from" sub={monthLabel(month)} />
            {summary.gross > 0 ? (
              <div className="split">
                <Donut
                  slices={[
                    { label: 'Day rate', value: summary.dayFees, color: 'var(--sea-500)' },
                    { label: 'Overtime', value: summary.overtime, color: 'var(--coral-500)' },
                    { label: 'Extras', value: summary.extras, color: 'var(--sun-300)' },
                  ]}
                  total={moneyShort(summary.gross, settings)}
                  caption="this month"
                />
                <div className="legend">
                  <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--sea-500)' }} />
                    <span className="muted">Day rate</span><span className="amt">{money(summary.dayFees, settings, { decimals: 0 })}</span></div>
                  <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--coral-500)' }} />
                    <span className="muted">Overtime</span><span className="amt">{money(summary.overtime, settings, { decimals: 0 })}</span></div>
                  <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--sun-300)' }} />
                    <span className="muted">Extras & premiums</span><span className="amt">{money(summary.extras, settings, { decimals: 0 })}</span></div>
                </div>
              </div>
            ) : <Empty art="🌴" title="No earnings this month" />}
          </Card>

          <Card>
            <CardHead title="By job" sub="All time" />
            <div className="rows">
              {store.data.productions.map((p) => summariseJob(p, store.data))
                .filter((j) => j.workedDays > 0)
                .sort((a, b) => b.earned - a.earned)
                .map((j) => (
                  <div key={j.production.id} className="row flat">
                    <span className="row-lead" style={{ background: `color-mix(in srgb, ${j.production.color} 22%, transparent)` }}>
                      <IconReceipt size={18} />
                    </span>
                    <span className="row-main">
                      <span className="row-title">{j.production.name}</span>
                      <span className="row-sub">{j.workedDays} days · {formatDuration(j.hours)}</span>
                    </span>
                    <span className="row-amount">{money(j.earned, settings, { decimals: 0 })}</span>
                  </div>
                ))}
            </div>
          </Card>

          <ExportCard month={month} />
        </div>
      )}

      {tab === 'invoice' && <InvoiceTab month={month} setMonth={setMonth} />}

      {tab === 'payments' && (
        <PaymentsTab owed={owed.owed} paid={owed.paid} />
      )}
    </>
  )
}

/** Downloads are blocked in some sandboxed hosts, so copying is always offered too. */
function ExportCard({ month }: { month: string }) {
  const store = useStore()
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null)

  const announce = (text: string, bad = false) => {
    setMessage({ text, bad })
    setTimeout(() => setMessage(null), 3500)
  }

  const copy = async (label: string, text: string) => {
    announce(await copyText(text) ? `${label} copied to the clipboard.` : 'Could not reach the clipboard.',
      false)
  }

  const save = async (label: string, file: string, text: string, type: string) => {
    const outcome = await saveFile(file, text, type)
    announce(describeOutcome(outcome, label), outcome === 'unavailable')
  }

  const items = [
    { label: 'This month', file: `ombak-${month}.csv`, type: 'text/csv', make: () => monthToCSV(month, store.data) },
    { label: 'Expenses', file: 'ombak-expenses.csv', type: 'text/csv', make: () => expensesToCSV(store.data) },
    { label: 'Full backup', file: `ombak-backup-${todayISO()}.json`, type: 'application/json', make: () => exportJSON(store.data) },
  ]

  return (
    <Card>
      <CardHead title="Export" sub="Take your numbers anywhere" />
      <div className="stack tight">
        {items.map((it) => (
          <div key={it.label} className="row flat">
            <span className="row-main"><span className="row-title">{it.label}</span></span>
            <span className="inline" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => void save(it.label, it.file, it.make(), it.type)}>
                <IconDownload size={14} /> Download
              </button>
              <button className="btn ghost sm" onClick={() => void copy(it.label, it.make())}>
                <IconCopy size={14} /> Copy
              </button>
            </span>
          </div>
        ))}
      </div>
      {message && (
        <p className="tiny" style={{ marginTop: 10, color: message.bad ? 'var(--bad)' : 'var(--accent-ink)' }}>
          {message.text}
        </p>
      )}
      <p className="tiny faint" style={{ marginTop: 8 }}>
        Copy puts the same content on the clipboard, ready to paste into a file.
      </p>
    </Card>
  )
}

function InvoiceTab({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const store = useStore()
  const { settings } = store
  const summary = useMemo(() => summariseMonth(month, store.data), [month, store.data])
  const months = useMemo(() => monthsWithData(store.data), [store.data])

  const jobTotals = useMemo(() => {
    const map = new Map<string | null, number>()
    for (const d of summary.days) {
      if (!d.worked) continue
      const id = store.data.days[d.date]?.productionId ?? null
      map.set(id, (map.get(id) ?? 0) + d.total)
    }
    return [...map.entries()].map(([id, total]) => ({ production: store.productionOf(id), total }))
  }, [summary.days, store])

  const primary = jobTotals.sort((a, b) => b.total - a.total)[0]?.production
  const me = settings.me

  return (
    <div className="stack" style={{ marginTop: 14 }}>
      <Card className="no-print">
        <CardHead title="Invoice month" />
        <Select
          value={month} onChange={setMonth}
          options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
        />
        <div className="inline" style={{ marginTop: 12, gap: 8 }}>
          <button className="btn primary sm" onClick={() => window.print()}><IconPrint size={15} /> Print / save PDF</button>
          <button
            className="btn sm"
            onClick={() => void saveFile(`invoice-${month}.csv`, monthToCSV(month, store.data), 'text/csv')}
          >
            <IconDownload size={15} /> Backing CSV
          </button>
        </div>
      </Card>

      <Card className="invoice">
        <div className="inv-head">
          <div>
            <div className="inv-title">Invoice</div>
            <div className="tiny muted">
              No. {String(settings.invoiceCounter).padStart(4, '0')} · {monthLabel(month)}
            </div>
          </div>
          <div className="right tiny muted">
            <div><b style={{ fontSize: 14, color: 'var(--text)' }}>{me.name || 'Your name'}</b></div>
            {me.role && <div>{me.role}</div>}
            {me.businessId && <div>ID {me.businessId}</div>}
            {me.phone && <div>{me.phone}</div>}
            {me.email && <div>{me.email}</div>}
          </div>
        </div>

        <hr className="hr" />

        <div className="inv-to">
          <div>
            <div className="tiny faint">Billed to</div>
            <div><b>{primary?.company || primary?.name || '—'}</b></div>
            {primary?.address && <div className="tiny muted">{primary.address}</div>}
          </div>
          <div className="right">
            <div className="tiny faint">Production</div>
            <div>{primary?.name ?? '—'}</div>
          </div>
        </div>

        <hr className="hr" />

        <table className="inv-table">
          <tbody>
            <tr><td>Day rate — {summary.workedDays} day{summary.workedDays === 1 ? '' : 's'}</td>
              <td className="right mono">{money(summary.dayFees, settings)}</td></tr>
            <tr><td>Overtime — {formatDuration(summary.overtimeHours)}</td>
              <td className="right mono">{money(summary.overtime, settings)}</td></tr>
            <tr><td>Premiums, travel & adjustments</td>
              <td className="right mono">{money(summary.extras, settings)}</td></tr>
            <tr className="sub-total"><td>Subtotal</td>
              <td className="right mono">{money(summary.gross, settings)}</td></tr>
            {settings.chargeVat && (
              <tr><td>VAT at {percent(settings.vatRate)}</td>
                <td className="right mono">{money(summary.vat, settings)}</td></tr>
            )}
            <tr className="grand"><td>Total due</td>
              <td className="right mono">{money(summary.invoiceTotal, settings)}</td></tr>
          </tbody>
        </table>

        {me.bank && (
          <>
            <hr className="hr" />
            <div className="tiny muted"><b>Payment details</b><br />{me.bank}</div>
          </>
        )}

        <p className="tiny faint" style={{ marginTop: 14 }}>
          Backing detail — every day, its hours and each premium — is in the month CSV.
        </p>
      </Card>

      <Card className="no-print">
        <CardHead title="Record it" sub="Track whether this actually gets paid" />
        <button
          className="btn primary block"
          onClick={() => {
            store.addPayment({
              month, productionId: primary?.id ?? null, amount: summary.invoiceTotal,
              status: 'invoiced', date: todayISO(),
              invoiceNumber: String(settings.invoiceCounter).padStart(4, '0'), note: '',
            })
            store.setSettings({ invoiceCounter: settings.invoiceCounter + 1 })
          }}
          disabled={summary.invoiceTotal <= 0}
        >
          <IconPlus size={16} /> Mark {monthLabel(month)} as invoiced
        </button>
      </Card>
    </div>
  )
}

function PaymentsTab({ owed, paid }: { owed: number; paid: number }) {
  const store = useStore()
  const { settings } = store
  const [editing, setEditing] = useState<Payment | 'new' | null>(null)

  const payments = useMemo(
    () => [...store.data.payments].sort((a, b) => b.month.localeCompare(a.month)),
    [store.data.payments],
  )

  return (
    <div className="stack" style={{ marginTop: 14 }}>
      <div className="stats">
        <Stat icon={<IconCoins size={14} />} label="Still owed" value={moneyShort(owed, settings)} tone="warm" />
        <Stat icon={<IconCoins size={14} />} label="Paid" value={moneyShort(paid, settings)} tone="good" />
        <Stat icon={<IconReceipt size={14} />} label="Entries" value={String(payments.length)} />
        <Stat icon={<IconCalendar size={14} />} label="Oldest open"
          value={payments.filter((p) => p.status !== 'paid').slice(-1)[0]?.month ?? '—'} />
      </div>

      <Card>
        <CardHead title="Invoices & payments"
          action={<button className="btn primary sm" onClick={() => setEditing('new')}><IconPlus size={15} /> Add</button>} />
        {payments.length === 0 ? (
          <Empty art="🧾" title="Nothing tracked yet">
            Record what you invoiced and tick it off when the money lands.
          </Empty>
        ) : (
          <div className="rows">
            {payments.map((p) => {
              const job = store.productionOf(p.productionId)
              return (
                <button key={p.id} className="row" onClick={() => setEditing(p)}>
                  <span className="row-lead" style={{ background: job ? `color-mix(in srgb, ${job.color} 20%, transparent)` : undefined }}>
                    <IconReceipt size={18} />
                  </span>
                  <span className="row-main">
                    <span className="row-title">
                      {monthLabel(p.month)}
                      <span className={`chip ${p.status === 'paid' ? 'good' : p.status === 'invoiced' ? 'accent' : 'gold'}`}>
                        {p.status}
                      </span>
                    </span>
                    <span className="row-sub">
                      {job?.name ?? 'No job'}{p.invoiceNumber ? ` · #${p.invoiceNumber}` : ''} · {prettyDate(p.date)}
                    </span>
                  </span>
                  <span className="row-amount">{money(p.amount, settings, { decimals: 0 })}</span>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      {editing && <PaymentSheet initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PaymentSheet({ initial, onClose }: { initial: Payment | null; onClose: () => void }) {
  const store = useStore()
  const { settings } = store
  const [month, setMonth] = useState(initial?.month ?? monthKey(todayISO()))
  const [amount, setAmount] = useState(initial?.amount ?? 0)
  const [status, setStatus] = useState<PaymentStatus>(initial?.status ?? 'invoiced')
  const [productionId, setProductionId] = useState(initial?.productionId ?? settings.defaultProductionId)
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [invoiceNumber, setInvoiceNumber] = useState(initial?.invoiceNumber ?? '')
  const [note, setNote] = useState(initial?.note ?? '')

  const save = () => {
    const payload = { month, amount, status, productionId, date, invoiceNumber, note }
    if (initial) store.updatePayment(initial.id, payload)
    else store.addPayment(payload)
    onClose()
  }

  const months = Array.from({ length: 18 }, (_, i) => addMonths(monthKey(todayISO()), 3 - i))

  return (
    <Sheet
      title={initial ? 'Edit entry' : 'New invoice'}
      onClose={onClose}
      action={initial ? (
        <button className="btn ghost sm" aria-label="Delete"
          onClick={() => { store.removePayment(initial.id); onClose() }}><IconTrash size={17} /></button>
      ) : undefined}
    >
      <div className="stack">
        <div className="card">
          <div className="stack tight">
            <Field label="For the month">
              <Select value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} />
            </Field>
            <Field label="Amount">
              <NumberInput value={amount} onChange={setAmount} suffix={settings.currency} min={0} />
            </Field>
            <Field label="Job">
              <Select
                value={productionId ?? ''} onChange={(v) => setProductionId(v || null)}
                options={[{ value: '', label: '— none —' },
                  ...store.data.productions.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </Field>
            <Field label="Status">
              <Segmented value={status} onChange={setStatus} options={STATUS} />
            </Field>
            <div className="field-row">
              <Field label="Date">
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Invoice no.">
                <TextInput value={invoiceNumber} onChange={setInvoiceNumber} placeholder="0001" />
              </Field>
            </div>
            <Field label="Note"><TextInput value={note} onChange={setNote} placeholder="Anything worth remembering" /></Field>
          </div>
        </div>
        <button className="btn primary block lg" onClick={save} disabled={amount <= 0}>
          {initial ? 'Save' : 'Add'}
        </button>
      </div>
    </Sheet>
  )
}
