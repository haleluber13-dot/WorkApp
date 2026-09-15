/*
 * iOS home-screen artwork. Safari ignores SVG touch icons, so these must be
 * PNGs, and it ignores the manifest's icons entirely — only apple-touch-icon
 * counts. Needs Playwright: `npm i -D playwright`.
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

const root = new URL('../', import.meta.url).pathname
const svg = readFileSync(`${root}public/icon.svg`, 'utf8')
mkdirSync(`${root}public/ios`, { recursive: true })

const executablePath = process.env.CHROMIUM_PATH || undefined
const browser = await chromium.launch(executablePath ? { executablePath } : {})
const page = await browser.newPage()

/** iOS masks the icon itself, so these are drawn square and full-bleed. */
const sized = (px) => svg
  .replace('viewBox="0 0 512 512"', `viewBox="0 0 512 512" width="${px}" height="${px}"`)
  .replace('<clipPath id="tile"><rect width="512" height="512" rx="114"/></clipPath>',
           '<clipPath id="tile"><rect width="512" height="512"/></clipPath>')

for (const px of [120, 152, 167, 180]) {
  await page.setViewportSize({ width: px, height: px })
  await page.setContent(`<body style="margin:0">${sized(px)}</body>`)
  await page.screenshot({ path: `${root}public/ios/touch-icon-${px}.png` })
}

// Launch screens. One per size class; iOS picks by exact pixel match, and
// anything unmatched simply falls back to a blank screen, which is fine.
const splashes = [
  { w: 1170, h: 2532, name: 'splash-1170x2532' }, // 12/13/14, 15/16
  { w: 1179, h: 2556, name: 'splash-1179x2556' }, // 14 Pro, 15/16 Pro
  { w: 1284, h: 2778, name: 'splash-1284x2778' }, // Max (older)
  { w: 1290, h: 2796, name: 'splash-1290x2796' }, // Pro Max
  { w: 1206, h: 2622, name: 'splash-1206x2622' }, // 16
  { w: 1320, h: 2868, name: 'splash-1320x2868' }, // 16 Pro Max
  { w: 1125, h: 2436, name: 'splash-1125x2436' }, // X / XS / 11 Pro
  { w: 828, h: 1792, name: 'splash-828x1792' },   // XR / 11
  { w: 750, h: 1334, name: 'splash-750x1334' },   // SE
]

for (const { w, h, name } of splashes) {
  await page.setViewportSize({ width: w, height: h })
  const mark = Math.round(Math.min(w, h) * 0.34)
  await page.setContent(`
    <body style="margin:0;width:${w}px;height:${h}px;background:#04262c;display:grid;place-items:center">
      ${svg.replace('viewBox="0 0 512 512"', `viewBox="0 0 512 512" width="${mark}" height="${mark}"`)}
    </body>`)
  await page.screenshot({ path: `${root}public/ios/${name}.png` })
}

await browser.close()
console.log(`rendered ${4 + splashes.length} iOS images`)
