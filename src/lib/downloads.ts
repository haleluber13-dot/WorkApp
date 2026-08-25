/**
 * Saving a file out of the app.
 *
 * Served as a plain web page, an anchor with `download` is all it takes. Inside
 * a sandboxed viewer that anchor is inert, and the host offers a mediated save
 * instead. Try the host first, fall back to the anchor, and always report back
 * so the UI can tell the truth about what happened.
 */

export type SaveOutcome = 'saved' | 'declined' | 'downloaded' | 'unavailable'

/** Extensions the host always accepts; anything else may need renaming. */
const ALWAYS_ALLOWED = new Set(['txt', 'json', 'md', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm'])

interface HostDownloads {
  save(request: { filename: string; data: string | Blob | ArrayBuffer }): Promise<{ status: 'saved' }>
}

interface CapabilityHost {
  use?: (name: string) => Promise<unknown>
}

/**
 * An Android WebView ignores an anchor download unless the host app wires up a
 * DownloadListener, so the click would silently do nothing. Better to say so.
 */
const inNativeShell = typeof (window as unknown as { Capacitor?: unknown }).Capacitor !== 'undefined'

/**
 * Resolved once, eagerly, so a later click doesn't wait on it. Resolves null
 * whenever there is no host — the ordinary web case.
 */
const hostSave: Promise<HostDownloads | null> = (() => {
  const claude = (window as unknown as { claude?: CapabilityHost }).claude
  if (!claude || typeof claude.use !== 'function') return Promise.resolve(null)
  return claude
    .use('downloads')
    .then((ns) => (ns && typeof (ns as HostDownloads).save === 'function' ? (ns as HostDownloads) : null))
    .catch(() => null)
})()

function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : 'unknown'
}

/** The plain-web path: hand the browser a blob URL and click it. */
function anchorDownload(filename: string, content: string, type: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch {
    return false
  }
}

function retitle(filename: string, extension: string): string {
  return `${filename.replace(/\.[^./\\]+$/, '')}.${extension}`
}

export async function saveFile(filename: string, content: string, type = 'application/json'): Promise<SaveOutcome> {
  const host = await hostSave

  if (host) {
    const extension = filename.split('.').pop()?.toLowerCase() ?? ''
    // A CSV may be outside the host's enabled set; plain text carries the same bytes.
    const attempts = ALWAYS_ALLOWED.has(extension) ? [filename] : [filename, retitle(filename, 'txt')]

    for (const name of attempts) {
      try {
        await host.save({ filename: name, data: content })
        return 'saved'
      } catch (err) {
        const code = errorCode(err)
        if (code === 'declined') return 'declined'
        if (code === 'rejected_extension' || code === 'extension_not_enabled') continue
        break
      }
    }
  }

  if (inNativeShell) return 'unavailable'
  return anchorDownload(filename, content, type) ? 'downloaded' : 'unavailable'
}

/** Wording for whatever the save attempt came back with. */
export function describeOutcome(outcome: SaveOutcome, label: string): string {
  switch (outcome) {
    case 'saved': return `${label} saved.`
    case 'downloaded': return `${label} downloaded.`
    case 'declined': return 'Save cancelled.'
    case 'unavailable': return 'Saving files is not available here — use Copy instead.'
  }
}
