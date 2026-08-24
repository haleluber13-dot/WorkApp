/*
 * Inlines the Vite build into one self-contained HTML fragment, suitable for a
 * host that wraps it in its own document shell. No external requests survive
 * except the Google Fonts stylesheet.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const assets = readdirSync(join(DIST, 'assets'))
const cssFile = assets.find((f) => f.endsWith('.css'))
const jsFile = assets.find((f) => f.endsWith('.js'))
if (!cssFile || !jsFile) throw new Error('Build output not found — run `npm run build` first.')

const css = readFileSync(join(DIST, 'assets', cssFile), 'utf8')
const js = readFileSync(join(DIST, 'assets', jsFile), 'utf8')

// A closing </script> anywhere in the bundle would end the inline script early.
const safeJs = js.replace(/<\/script/gi, '<\\/script')

const out = `<title>Ombak</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
<style>
${css}
</style>
<div id="root"></div>
<script>window.__OMBAK_NO_SW__ = true</script>
<script type="module">
${safeJs}
</script>
`

writeFileSync(process.argv[2] ?? 'dist/ombak-standalone.html', out)
console.log(`Wrote ${(out.length / 1024).toFixed(0)} kB to ${process.argv[2] ?? 'dist/ombak-standalone.html'}`)
