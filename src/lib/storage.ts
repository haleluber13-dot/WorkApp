import type { AppData } from '../types'
import { defaultData, defaultSettings } from './defaults'

const KEY = 'ombak.data.v1'

/** Fill in anything a older/partial save is missing, so upgrades never blank the app. */
function hydrate(raw: Partial<AppData>): AppData {
  const base = defaultData()
  const data: AppData = {
    version: 1,
    settings: { ...defaultSettings(), ...(raw.settings ?? {}) },
    productions: raw.productions?.length ? raw.productions : base.productions,
    days: raw.days ?? {},
    expenses: raw.expenses ?? [],
    payments: raw.payments ?? [],
    activeShift: raw.activeShift ?? null,
  }
  data.settings.me = { ...defaultSettings().me, ...(raw.settings?.me ?? {}) }
  if (!data.settings.ringFees || data.settings.ringFees.length < 7) {
    data.settings.ringFees = defaultSettings().ringFees
  }
  // Backfill fields added after a save was written.
  data.productions = data.productions.map((p) => ({
    ...p,
    startsOn: p.startsOn ?? null,
    endsOn: p.endsOn ?? null,
    note: p.note ?? '',
    rates: (p.rates && p.rates.length === 3 ? p.rates : [850, 1500, 2000]) as [number, number, number],
  }))
  for (const key of Object.keys(data.days)) {
    const d = data.days[key]
    data.days[key] = { ...d, booked: d.booked ?? false, tags: d.tags ?? [], place: d.place ?? null }
  }
  if (!data.settings.defaultProductionId) {
    data.settings.defaultProductionId = data.productions[0]?.id ?? null
  }
  return data
}

export function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultData()
    return hydrate(JSON.parse(raw))
  } catch {
    return defaultData()
  }
}

export function save(data: AppData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Storage full or blocked (private window). The app keeps working in memory.
  }
}

export function exportJSON(data: AppData): string {
  return JSON.stringify(data, null, 2)
}

export function importJSON(text: string): AppData {
  return hydrate(JSON.parse(text))
}

/**
 * Copy text to the clipboard. Some hosts sandbox the page and silently drop
 * downloads, so every export offers this as a way out too.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}
