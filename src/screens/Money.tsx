import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { expensesByCategory, summariseMonth } from '../lib/stats'
import { money, moneyShort, percent } from '../lib/format'
import { addMonths, monthKey, monthLabel, prettyDate, todayISO } from '../lib/time'
import type { Expense, ExpenseCategory } from '../types'
import { Bar, Card, CardHead, Empty, Field, NumberInput, Segmented, Select, Sheet, Stat, TextInput, Toggle } from '../components/ui'
import { Donut } from '../components/charts'
import {
  IconChevronLeft, IconChevronRight, IconCoins, IconPlus,
  IconTrash, IconWallet, IconSurf, IconReceipt,
} from '../components/Icons'

const CATEGORIES: { value: ExpenseCategory; label: string; emoji: string; color: string }[] = [
  { value: 'travel', label: 'Travel', emoji: '🛵', color: '#2ec4b6' },
  { value: 'food', label: 'Food', emoji: '🍜', color: '#ff9e6d' },
  { value: 'gear', label: 'Gear', emoji: '🎒', color: '#5aa9e6' },
  { value: 'phone', label: 'Phone & net', emoji: '📱', color: '#9d8df1' },
  { value: 'rent', label: 'Rent & bills', emoji: '🏠', color: '#ffd166' },
  { value: 'health', label: 'Health', emoji: '🩺', color: '#f4978e' },
  { value: 'fun', label: 'Fun', emoji: '🏄', color: '#8ac926' },
  { value: 'family', label: 'Family', emoji: '💛', color: '#ff7a59' },
  { value: 'tax', label: 'Tax & fees', emoji: '🧾', color: '#7a8b8f' },
  { value: 'other', label: 'Other', emoji: '🐚', color: '#b0a08c' },
]

const catInfo = (c: string) => CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[CATEGORIES.length - 1]

export function Money({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const store = useStore()
  const { settings } = store
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [scope, setScope] = useState<'month' | 'all'>('month')

  const summary = useMemo(() => summariseMonth(month, store.data), [month, store.data])

  const expenses = useMemo(() => {
    const list = scope === 'month'
      ? store.data.expenses.filter((e) => monthKey(e.date) === month)
      : store.data.expenses
    return [...list].sort((a, b) => b.date.localeCompare(a.date))
  }, [store.data.expenses, month, scope])

  const byCategory = useMemo(() => expensesByCategory(expenses), [expenses])
  const spent = expenses.reduce((s, e) => s + e.amount, 0)
  const personal = expenses.filter((e) => !e.billable).reduce((s, e) => s + e.amount, 0)

  const burnRate = summary.gross > 0 ? summary.spent / summary.gross : 0

  return (
    <>
      <div className="hero" style={{ background: 'var(--grad-sunset)', color: '#4a2410' }}>
        <div className="hero-top">
          <div className="hero-brand">
            <span className="hero-mark" style={{ background: 'rgba(255,255,255,.3)' }}><IconWallet size={19} /></span>
            <div>
              <div className="hero-title">Money</div>
              <div className="hero-sub" style={{ opacity: .7 }}>What comes in, what goes out</div>
            </div>
          </div>
        </div>
        <div className="hero-body readout" style={{ color: '#4a2410' }}>
          <div className="inline" style={{ gap: 6 }}>
            <button className="icon-btn" style={{ background: 'rgba(255,255,255,.3)', color: '#4a2410' }}
              onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
              <IconChevronLeft size={18} />
            </button>
            <span style={{ fontWeight: 600, minWidth: 128, textAlign: 'center' }}>{monthLabel(month)}</span>
            <button className="icon-btn" style={{ background: 'rgba(255,255,255,.3)', color: '#4a2410' }}
              onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
              <IconChevronRight size={18} />
            </button>
          </div>
          <div className="label" style={{ marginTop: 12, opacity: .65 }}>Kept this month</div>
          <div className="value">{money(summary.net, settings, { decimals: 0 })}</div>
          <div className="meta" style={{ opacity: .78 }}>
            <span>Earned <b>{moneyShort(summary.gross, settings)}</b></span>
            <span>Spent <b>{moneyShort(summary.spent, settings)}</b></span>
            <span>Tax pot <b>{moneyShort(summary.taxSetAside, settings)}</b></span>
          </div>
        </div>
      </div>

      <div className="stats">
        <Stat icon={<IconCoins size={14} />} label="Earned" value={moneyShort(summary.gross, settings)} tone="good" />
        <Stat icon={<IconWallet size={14} />} label="Spent" value={moneyShort(summary.spent, settings)} tone="warm" />
        <Stat icon={<IconReceipt size={14} />} label="Billable" value={moneyShort(summary.billableSpent, settings)}
          hint="Claim it back" tone="accent" />
        <Stat icon={<IconSurf size={14} />} label="Burn rate" value={percent(Math.min(burnRate, 9.99))}
          hint="of what you earned" tone={burnRate > 0.6 ? 'bad' : ''} />
      </div>

      <Card>
        <div className="inline between" style={{ marginBottom: 8 }}>
          <b>Earned vs spent</b>
          <span className="tiny muted">{monthLabel(month)}</span>
        </div>
        <div className="stack tight">
          <div>
            <div className="inline between tiny muted"><span>Earned</span><span>{money(summary.gross, settings, { decimals: 0 })}</span></div>
            <Bar value={summary.gross} max={Math.max(summary.gross, summary.spent, 1)} />
          </div>
          <div>
            <div className="inline between tiny muted"><span>Spent</span><span>{money(summary.spent, settings, { decimals: 0 })}</span></div>
            <Bar value={summary.spent} max={Math.max(summary.gross, summary.spent, 1)} warm />
          </div>
        </div>
        <p className="tiny muted" style={{ marginTop: 10 }}>
          After setting aside {percent(settings.taxSetAside)} for tax and paying for {money(personal, settings, { decimals: 0 })} of
          personal spending, you keep {money(summary.net, settings, { decimals: 0 })}.
        </p>
      </Card>

      <div className="inline between" style={{ margin: '18px 0 10px' }}>
        <Segmented
          value={scope} onChange={setScope}
          options={[{ value: 'month', label: monthLabel(month) }, { value: 'all', label: 'All time' }]}
        />
        <button className="btn primary sm" onClick={() => setEditing('new')}><IconPlus size={15} /> Add</button>
      </div>

      {byCategory.length > 0 && (
        <Card>
          <CardHead title="Where it went" sub={`${money(spent, settings, { decimals: 0 })} across ${expenses.length} entries`} />
          <div className="split">
            <Donut
              slices={byCategory.slice(0, 8).map((c) => ({ label: c.category, value: c.amount, color: catInfo(c.category).color }))}
              total={moneyShort(spent, settings)}
              caption="spent"
            />
            <div className="legend">
              {byCategory.slice(0, 8).map((c) => (
                <div key={c.category} className="legend-item">
                  <span className="legend-dot" style={{ background: catInfo(c.category).color }} />
                  <span className="muted">{catInfo(c.category).emoji} {catInfo(c.category).label}</span>
                  <span className="amt">{money(c.amount, settings, { decimals: 0 })}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHead title="Entries" />
        {expenses.length === 0 ? (
          <Empty art="🥥" title="Nothing spent yet">
            Log what you spend and the app will show you what actually stays in your pocket.
          </Empty>
        ) : (
          <div className="rows">
            {expenses.map((e) => (
              <button key={e.id} className="row" onClick={() => setEditing(e)}>
                <span className="row-lead" style={{ background: `color-mix(in srgb, ${catInfo(e.category).color} 20%, transparent)` }}>
                  <span style={{ fontSize: 18 }}>{catInfo(e.category).emoji}</span>
                </span>
                <span className="row-main">
                  <span className="row-title">
                    {e.note || catInfo(e.category).label}
                    {e.billable && <span className="chip accent">Billable</span>}
                  </span>
                  <span className="row-sub">{prettyDate(e.date)} · {catInfo(e.category).label}</span>
                </span>
                <span className="row-amount" style={{ color: 'var(--warm)' }}>
                  −{money(e.amount, settings, { decimals: 0 })}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {editing && (
        <ExpenseSheet
          initial={editing === 'new' ? null : editing}
          month={month}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function ExpenseSheet({ initial, month, onClose }: { initial: Expense | null; month: string; onClose: () => void }) {
  const store = useStore()
  const { settings } = store
  const [date, setDate] = useState(initial?.date ?? (monthKey(todayISO()) === month ? todayISO() : `${month}-01`))
  const [amount, setAmount] = useState(initial?.amount ?? 0)
  const [category, setCategory] = useState<ExpenseCategory>(initial?.category ?? 'food')
  const [note, setNote] = useState(initial?.note ?? '')
  const [billable, setBillable] = useState(initial?.billable ?? false)
  const [productionId, setProductionId] = useState(initial?.productionId ?? null)

  const save = () => {
    const payload = { date, amount, category, note, billable, productionId }
    if (initial) store.updateExpense(initial.id, payload)
    else store.addExpense(payload)
    onClose()
  }

  return (
    <Sheet
      title={initial ? 'Edit expense' : 'New expense'}
      onClose={onClose}
      action={initial ? (
        <button className="btn ghost sm" aria-label="Delete"
          onClick={() => { store.removeExpense(initial.id); onClose() }}>
          <IconTrash size={17} />
        </button>
      ) : undefined}
    >
      <div className="stack">
        <div className="card">
          <div className="stack tight">
            <Field label="Amount">
              <NumberInput value={amount} onChange={setAmount} suffix={settings.currency} min={0} />
            </Field>
            <Field label="What for">
              <TextInput value={note} onChange={setNote} placeholder="Petrol to set, lunch, new tripod plate…" />
            </Field>
            <Field label="Date">
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="card">
          <CardHead title="Category" />
          <div className="cat-grid">
            {CATEGORIES.map((c) => (
              <button
                key={c.value} type="button"
                className={`cat ${category === c.value ? 'on' : ''}`}
                style={category === c.value ? { borderColor: c.color, background: `color-mix(in srgb, ${c.color} 16%, transparent)` } : undefined}
                onClick={() => setCategory(c.value)}
              >
                <span className="e">{c.emoji}</span>
                <span className="l">{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="stack tight">
            <Toggle
              checked={billable} onChange={setBillable}
              title="Billable to a production"
              desc="Work costs you expect to get back. They don't count against what you keep."
            />
            {billable && (
              <Field label="Production">
                <Select
                  value={productionId ?? ''}
                  onChange={(v) => setProductionId(v || null)}
                  options={[
                    { value: '', label: '— none —' },
                    ...store.data.productions.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </Field>
            )}
          </div>
        </div>

        <button className="btn primary block lg" onClick={save} disabled={amount <= 0}>
          {initial ? 'Save changes' : 'Add expense'}
        </button>
      </div>
    </Sheet>
  )
}

export { CATEGORIES, catInfo }
