/* Downscale and re-encode PBR maps for the web.
 *
 * A 1K JPEG is 300-500 KB; at the size these tile across a casting or a tyre
 * that is entirely wasted. There is no image library here, so the browser does
 * the work: decode, draw to a canvas at the target size, re-encode.
 *
 *   node tools/resize-maps.mjs <out-dir> <name>=<file>:<size>[:<quality>] ...
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { extname, basename } from 'path';

const args = process.argv.slice(2);
const outDir = args.shift();
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');

let total = 0;
for (const spec of args) {
  const [name, rest] = spec.split('=');
  const [file, sizeStr, qStr] = rest.split(':');
  const size = parseInt(sizeStr, 10);
  const quality = qStr ? parseFloat(qStr) : 0.82;
  const mime = extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  const dataUri = `data:${mime};base64,` + readFileSync(file).toString('base64');

  const out = await page.evaluate(async ([uri, n, q, m]) => {
    const img = new Image();
    img.src = uri;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, n, n);
    return c.toDataURL(m, q);
  }, [dataUri, size, quality, mime]);

  const ext = out.startsWith('data:image/png') ? '.png' : '.jpg';
  const buf = Buffer.from(out.split(',')[1], 'base64');
  const dst = `${outDir}/${name}${ext}`;
  writeFileSync(dst, buf);
  total += buf.length;
  console.log(`${name.padEnd(26)} ${basename(file).padEnd(34)} ${size}px  ${(buf.length/1024).toFixed(0)} KB`);
}
console.log(`total ${(total/1024).toFixed(0)} KB`);
await browser.close();
