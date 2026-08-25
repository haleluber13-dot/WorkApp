import { useState } from 'react'
import type { Place } from '../types'
import { currentLocation, describeFailure, formatCoords, hasFix, mapsUrl } from '../lib/location'
import { Field, TextInput } from './ui'
import { IconCrosshair, IconExternal, IconPin, IconX } from './Icons'

/**
 * Naming and pinning where a day of work happened. The name is the part that
 * matters day to day; the coordinates are a bonus when the device supplies them.
 */
export function PlaceField({
  place, onChange,
}: { place: Place | null; onChange: (place: Place | null) => void }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const pin = async () => {
    setBusy(true)
    setProblem(null)
    const { place: found, failure } = await currentLocation()
    setBusy(false)
    if (failure) { setProblem(describeFailure(failure)); return }
    if (found) onChange({ ...found, name: place?.name ?? '' })
  }

  const url = place ? mapsUrl(place) : null

  return (
    <div className="stack tight">
      <Field label="Where">
        <TextInput
          value={place?.name ?? ''}
          onChange={(name) => onChange({
            name,
            lat: place?.lat ?? null,
            lng: place?.lng ?? null,
            accuracy: place?.accuracy ?? null,
            at: place?.at ?? null,
          })}
          placeholder="Beach set, Studio 4, Ubud house…"
        />
      </Field>

      <div className="inline" style={{ gap: 8 }}>
        <button className="btn sm" onClick={() => void pin()} disabled={busy}>
          <IconCrosshair size={15} /> {busy ? 'Finding you…' : hasFix(place) ? 'Update pin' : 'Use my location'}
        </button>
        {place && (
          <button className="btn ghost sm" onClick={() => { onChange(null); setProblem(null) }}>
            <IconX size={15} /> Clear
          </button>
        )}
      </div>

      {hasFix(place) && (
        <div className="pin-row">
          <IconPin size={15} />
          <span className="mono tiny">{formatCoords(place)}</span>
          {place.accuracy !== null && <span className="tiny faint">±{Math.round(place.accuracy)}m</span>}
          {url && (
            <a className="tiny" href={url} target="_blank" rel="noreferrer">
              Open in maps <IconExternal size={12} />
            </a>
          )}
        </div>
      )}

      {problem && <p className="tiny" style={{ color: 'var(--warm)' }}>{problem}</p>}
    </div>
  )
}
