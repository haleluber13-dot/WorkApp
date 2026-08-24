import { useMemo } from 'react'
import { useStore } from '../state/store'
import { staleBookings } from '../lib/stats'
import { prettyDate, todayISO } from '../lib/time'
import { Card, CardHead } from './ui'
import { IconAlert, IconCheck, IconX } from './Icons'

/**
 * Booked days that have already passed without being logged. Easy to forget,
 * and every one of them is a day you might not invoice.
 */
export function PendingBookings({ onPickDay }: { onPickDay: (date: string) => void }) {
  const store = useStore()
  const today = todayISO()
  const stale = useMemo(() => staleBookings(store.data, today), [store.data, today])

  if (!stale.length) return null

  return (
    <Card style={{ borderColor: 'color-mix(in srgb, var(--gold) 55%, transparent)' }}>
      <CardHead
        title={`${stale.length} booked day${stale.length === 1 ? '' : 's'} went by`}
        sub="Did you work them? Log them before you invoice."
        action={<IconAlert size={18} style={{ color: 'var(--gold)' }} />}
      />
      <div className="rows">
        {stale.slice(0, 8).map((d) => {
          const job = store.productionOf(d.productionId)
          return (
            <div key={d.date} className="row flat">
              <span className="row-main">
                <span className="row-title">{prettyDate(d.date)}</span>
                <span className="row-sub">{job?.name ?? 'No job'}</span>
              </span>
              <span className="inline" style={{ gap: 6 }}>
                <button className="btn sm" onClick={() => onPickDay(d.date)}>
                  <IconCheck size={14} /> Log it
                </button>
                <button
                  className="btn ghost sm" aria-label="Did not happen"
                  onClick={() => store.setDay(d.date, { booked: false })}
                ><IconX size={15} /></button>
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
