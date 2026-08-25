/**
 * Where you are when a shift starts.
 *
 * Two routes: the Capacitor plugin inside the Android app, which asks for the
 * runtime permission properly, and the browser's own geolocation everywhere
 * else. Either can be refused, and a refusal is a normal outcome — the place
 * name is always editable by hand, so nothing depends on a fix arriving.
 */

import type { Place } from '../types'

export type LocationFailure = 'denied' | 'unavailable' | 'timeout'

export interface LocationResult {
  place: Place | null
  failure: LocationFailure | null
}

interface CapPosition {
  coords: { latitude: number; longitude: number; accuracy: number }
  timestamp: number
}

interface CapGeolocation {
  getCurrentPosition(options?: { enableHighAccuracy?: boolean; timeout?: number }): Promise<CapPosition>
  requestPermissions?(): Promise<{ location: string }>
}

function nativePlugin(): CapGeolocation | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
  const plugin = cap?.Plugins?.Geolocation as CapGeolocation | undefined
  return plugin && typeof plugin.getCurrentPosition === 'function' ? plugin : null
}

function toPlace(lat: number, lng: number, accuracy: number, at: number, name = ''): Place {
  return { name, lat, lng, accuracy: Number.isFinite(accuracy) ? accuracy : null, at }
}

/** Never rejects. A failure comes back as a reason you can show the user. */
export async function currentLocation(timeoutMs = 12_000): Promise<LocationResult> {
  const native = nativePlugin()

  if (native) {
    try {
      if (native.requestPermissions) {
        const status = await native.requestPermissions()
        if (status.location === 'denied') return { place: null, failure: 'denied' }
      }
      const pos = await native.getCurrentPosition({ enableHighAccuracy: true, timeout: timeoutMs })
      return {
        place: toPlace(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp),
        failure: null,
      }
    } catch {
      return { place: null, failure: 'unavailable' }
    }
  }

  if (!('geolocation' in navigator)) return { place: null, failure: 'unavailable' }

  return new Promise<LocationResult>((resolve) => {
    let settled = false
    const done = (result: LocationResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => done({
        place: toPlace(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp),
        failure: null,
      }),
      (err) => done({
        place: null,
        failure: err.code === err.PERMISSION_DENIED ? 'denied'
          : err.code === err.TIMEOUT ? 'timeout' : 'unavailable',
      }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    )

    // Some embedders never call either callback; don't leave the caller hanging.
    setTimeout(() => done({ place: null, failure: 'timeout' }), timeoutMs + 1000)
  })
}

export function describeFailure(failure: LocationFailure): string {
  switch (failure) {
    case 'denied': return 'Location permission was refused. Type the place instead.'
    case 'timeout': return 'Could not get a fix in time. Type the place instead.'
    case 'unavailable': return 'Location is not available here. Type the place instead.'
  }
}

export function hasFix(place: Place | null | undefined): place is Place & { lat: number; lng: number } {
  return !!place && typeof place.lat === 'number' && typeof place.lng === 'number'
}

/** A short, readable pin: "-8.6705, 115.2126". */
export function formatCoords(place: Place): string {
  if (!hasFix(place)) return ''
  return `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`
}

/** A link that opens the pin in whatever map app the device prefers. */
export function mapsUrl(place: Place): string | null {
  if (!hasFix(place)) return null
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
}

/** What to show for a place: its name, else its coordinates. */
export function placeLabel(place: Place | null | undefined): string {
  if (!place) return ''
  if (place.name.trim()) return place.name.trim()
  return hasFix(place) ? formatCoords(place) : ''
}
