/*
 * Renders the launcher, adaptive-icon foreground and splash artwork from
 * public/icon.svg. Needs Playwright: `npm i -D playwright`.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('../', import.meta.url).pathname + 'public/icon.svg', 'utf8')
// Honour a preinstalled Chromium when one is pinned, otherwise let Playwright pick.
const executablePath = process.env.CHROMIUM_PATH || undefined
const browser = await chromium.launch(executablePath ? { executablePath } : {})

// Full-bleed icon (rounded tile baked in) for the app icon.
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
await page.setContent(`<body style="margin:0">${svg.replace('viewBox="0 0 512 512"', 'viewBox="0 0 512 512" width="1024" height="1024"')}</body>`)
await page.screenshot({ path: new URL('../', import.meta.url).pathname + 'assets/icon.png', omitBackground: true })

// Foreground for Android's adaptive icon: the artwork inset inside the safe zone,
// on a transparent ground, with no tile of its own.
const inner = svg
  .replace('<clipPath id="tile"><rect width="512" height="512" rx="114"/></clipPath>', '<clipPath id="tile"><circle cx="256" cy="256" r="256"/></clipPath>')
  .replace('<rect width="512" height="512" fill="url(#ground)"/>', '')
await page.setContent(`
  <body style="margin:0;width:1024px;height:1024px">
    <div style="width:1024px;height:1024px;display:grid;place-items:center">
      <div style="width:660px;height:660px;overflow:hidden;border-radius:50%">
        ${inner.replace('viewBox="0 0 512 512"', 'viewBox="0 0 512 512" width="660" height="660"')}
      </div>
    </div>
  </body>`)
await page.screenshot({ path: new URL('../', import.meta.url).pathname + 'assets/icon-foreground.png', omitBackground: true })

// Splash: the mark centred on the deep-water ground.
await page.setViewportSize({ width: 2732, height: 2732 })
await page.setContent(`
  <body style="margin:0;width:2732px;height:2732px;background:#04262c;display:grid;place-items:center">
    ${svg.replace('viewBox="0 0 512 512"', 'viewBox="0 0 512 512" width="900" height="900"')}
  </body>`)
await page.screenshot({ path: new URL('../', import.meta.url).pathname + 'assets/splash.png' })

await browser.close()
console.log('icons rendered')
