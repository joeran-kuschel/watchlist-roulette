// Draws the app icons from the "film ring" mark (see documentation/ui/branding.md) and writes
//   public/favicon.svg          vector favicon, light or dark ring depending on the browser theme
//   public/favicon.ico          16, 32 and 48 px, for browsers without SVG favicons
//   public/apple-touch-icon.png 180 px, for iOS home screens
// Run with: npm run icons   (needs a Chromium for Playwright: npx playwright install chromium,
// or set CHROME_PATH to an existing Chrome/Chromium)
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url))
const DARK = '#12141A'
const CREAM = '#F2EFE8'
const ACCENT = '#FF6B47'

// Two drawings of the same mark on a 64 x 64 grid: the full one, and a heavier one with fewer
// perforations that still reads as a ring around a dot at 16 and 32 px.
const FULL = { sw: 8, dash: '8.8 3.77', dot: 10 }
const SMALL = { sw: 11, dash: '13.2 5.65', dot: 11 }

const mark = (m, ring) =>
  `<circle cx="32" cy="32" r="24" fill="none" stroke="${ring}" stroke-width="${m.sw}" stroke-dasharray="${m.dash}"/>` +
  `<circle cx="32" cy="32" r="${m.dot}" fill="${ACCENT}"/>`

// The favicon on a transparent ground: the ring follows the browser's light or dark theme
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<style>.ring{stroke:${DARK}}@media (prefers-color-scheme:dark){.ring{stroke:${CREAM}}}</style>
<circle class="ring" cx="32" cy="32" r="24" fill="none" stroke-width="${SMALL.sw}" stroke-dasharray="${SMALL.dash}"/>
<circle cx="32" cy="32" r="${SMALL.dot}" fill="${ACCENT}"/>
</svg>
`

// A dark tile with the cream ring, which works on any browser or home screen background
const tile = ({ size, m, scale, radius }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">` +
  `<rect width="64" height="64" rx="${radius}" fill="${DARK}"/>` +
  `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${mark(m, CREAM)}</g></svg>`

const ICO_SIZES = [
  { size: 16, m: SMALL, scale: 1, radius: 10 },
  { size: 32, m: SMALL, scale: 1, radius: 10 },
  { size: 48, m: FULL, scale: 0.9, radius: 12 },
]
const APPLE = { size: 180, m: FULL, scale: 0.78, radius: 0 } // iOS rounds the corners itself

async function render(browser, spec) {
  const page = await browser.newPage({ viewport: { width: spec.size, height: spec.size } })
  await page.setContent(`<body style="margin:0;background:transparent">${tile(spec)}</body>`)
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: spec.size, height: spec.size } })
  await page.close()
  return png
}

/** An .ico file holding PNG images. */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length)
  head.writeUInt16LE(1, 2) // type: icon
  head.writeUInt16LE(images.length, 4)
  let offset = head.length
  images.forEach(({ size, png }, i) => {
    const at = 6 + 16 * i
    head.writeUInt8(size, at) // width
    head.writeUInt8(size, at + 1) // height
    head.writeUInt16LE(1, at + 4) // planes
    head.writeUInt16LE(32, at + 6) // bits per pixel
    head.writeUInt32LE(png.length, at + 8)
    head.writeUInt32LE(offset, at + 12)
    offset += png.length
  })
  return Buffer.concat([head, ...images.map((image) => image.png)])
}

await mkdir(PUBLIC, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
try {
  const images = []
  for (const spec of ICO_SIZES) images.push({ size: spec.size, png: await render(browser, spec) })
  await writeFile(`${PUBLIC}favicon.svg`, faviconSvg)
  await writeFile(`${PUBLIC}favicon.ico`, ico(images))
  await writeFile(`${PUBLIC}apple-touch-icon.png`, await render(browser, APPLE))
  console.log('Wrote favicon.svg, favicon.ico and apple-touch-icon.png to public/')
} finally {
  await browser.close()
}
