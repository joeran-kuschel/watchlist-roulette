import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

// The files are read from the frontend folder, which is where vitest runs
const read = (path: string) => readFileSync(resolve(process.cwd(), path))
const html = read('index.html').toString()

describe('favicon and touch icon', () => {
  it('links the SVG favicon, the .ico fallback and the touch icon in index.html', () => {
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any">')
    expect(html).toContain('<link rel="icon" href="/favicon.ico"')
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">')
    expect(html).toContain('<meta name="theme-color"')
  })

  it('has a vector favicon that follows the color-scheme preference and keeps the accent dot', () => {
    const svg = read('public/favicon.svg').toString()
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">')
    expect(svg).toContain('prefers-color-scheme:dark')
    expect(svg).toContain('stroke-dasharray')
    expect(svg).toContain('#FF6B47')
    expect(svg).not.toMatch(/<script|onload=|href=/i)
  })

  it('has an .ico with 16, 32 and 48 px images, each a PNG', () => {
    const ico = read('public/favicon.ico')
    expect(ico.readUInt16LE(0)).toBe(0) // reserved
    expect(ico.readUInt16LE(2)).toBe(1) // type: icon
    expect(ico.readUInt16LE(4)).toBe(3)
    const sizes: number[] = []
    for (let i = 0; i < 3; i++) {
      const entry = 6 + 16 * i
      sizes.push(ico.readUInt8(entry))
      const length = ico.readUInt32LE(entry + 8)
      const offset = ico.readUInt32LE(entry + 12)
      expect(offset + length).toBeLessThanOrEqual(ico.length)
      expect(ico.subarray(offset, offset + 8).toString('hex')).toBe('89504e470d0a1a0a') // PNG signature
    }
    expect(sizes).toEqual([16, 32, 48])
  })

  it('has a 180 x 180 px touch icon', () => {
    const png = read('public/apple-touch-icon.png')
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(180) // width in the IHDR chunk
    expect(png.readUInt32BE(20)).toBe(180) // height
  })

  it('has a page title and language', () => {
    expect(html).toContain('<title>Watchlist Roulette</title>')
    expect(html).toContain('<html lang="en">')
  })
})

// --- Icon files in depth -------------------------------------------------------------------------

/** Decodes an 8-bit RGB or RGBA PNG (the only kinds the icon script writes) into its pixels. */
function decodePng(png: Buffer) {
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const colorType = png.readUInt8(25)
  expect(png.readUInt8(24)).toBe(8)
  expect([2, 6]).toContain(colorType)
  const bpp = colorType === 6 ? 4 : 3
  const data: Buffer[] = []
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at)
    if (png.subarray(at + 4, at + 8).toString('latin1') === 'IDAT') data.push(png.subarray(at + 8, at + 8 + length))
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(data))
  const stride = width * bpp
  const out = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * (stride + 1) + 1 + x]!
      const a = x >= bpp ? out[y * stride + x - bpp]! : 0
      const b = y > 0 ? out[(y - 1) * stride + x]! : 0
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp]! : 0
      const p = a + b - c
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      out[y * stride + x] = (cur + [0, a, b, (a + b) >> 1, paeth][filter]!) & 255
    }
  }
  const pixel = (x: number, y: number) => {
    const i = y * stride + x * bpp
    return { r: out[i]!, g: out[i + 1]!, b: out[i + 2]!, a: bpp === 4 ? out[i + 3]! : 255 }
  }
  return { width, height, hasAlpha: bpp === 4, pixel }
}

const icoImages = () => {
  const ico = read('public/favicon.ico')
  return Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
    const entry = 6 + 16 * i
    const offset = ico.readUInt32LE(entry + 12)
    const length = ico.readUInt32LE(entry + 8)
    return { width: ico.readUInt8(entry), height: ico.readUInt8(entry + 1), offset, length, png: ico.subarray(offset, offset + length) }
  })
}

describe('favicon.ico in depth', () => {
  it('declares for each image the size of the PNG inside it', () => {
    for (const image of icoImages()) {
      const decoded = decodePng(image.png)
      expect(decoded.width).toBe(image.width)
      expect(decoded.height).toBe(image.height)
    }
  })

  it('stores the images back to back, with no gaps and no trailing bytes', () => {
    const images = icoImages()
    let expected = 6 + 16 * images.length
    for (const image of images) {
      expect(image.offset).toBe(expected)
      expected += image.length
    }
    expect(expected).toBe(read('public/favicon.ico').length)
  })

  it('declares 1 plane and 32 bits per pixel', () => {
    const ico = read('public/favicon.ico')
    for (let i = 0; i < 3; i++) {
      expect(ico.readUInt16LE(6 + 16 * i + 4)).toBe(1)
      expect(ico.readUInt16LE(6 + 16 * i + 6)).toBe(32)
    }
  })

  it('has an alpha channel, with rounded corners that let the tab color through', () => {
    for (const image of icoImages()) {
      const decoded = decodePng(image.png)
      expect(decoded.hasAlpha).toBe(true)
      // Anti-aliased, so the corner pixel is mostly, not fully, transparent
      expect(decoded.pixel(0, 0).a).toBeLessThan(128)
      expect(decoded.pixel(decoded.width - 1, decoded.height - 1).a).toBeLessThan(128)
    }
  })

  it('draws the orange dot in the middle of every image', () => {
    for (const image of icoImages()) {
      const decoded = decodePng(image.png)
      expect(decoded.pixel(decoded.width / 2, decoded.height / 2)).toMatchObject({ r: 0xff, g: 0x6b, b: 0x47, a: 255 })
    }
  })
})

describe('apple-touch-icon.png in depth', () => {
  const decoded = decodePng(read('public/apple-touch-icon.png'))

  it('is fully opaque, because iOS fills transparent pixels with black', () => {
    expect(decoded.hasAlpha).toBe(false)
    expect(decoded.pixel(0, 0).a).toBe(255)
    expect(decoded.pixel(179, 179).a).toBe(255)
  })

  it('has the dark tile color in the corners and the orange dot in the middle', () => {
    expect(decoded.pixel(0, 0)).toMatchObject({ r: 0x12, g: 0x14, b: 0x1a })
    expect(decoded.pixel(90, 90)).toMatchObject({ r: 0xff, g: 0x6b, b: 0x47 })
  })
})

describe('favicon.svg in depth', () => {
  const source = read('public/favicon.svg').toString()
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')

  it('is well-formed XML with an svg root in the SVG namespace', () => {
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.documentElement.localName).toBe('svg')
    expect(doc.documentElement.namespaceURI).toBe('http://www.w3.org/2000/svg')
  })

  it('has no external references, scripts or event handlers', () => {
    expect(source).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/)
    expect(source).not.toMatch(/url\(|@import|xlink:href|<image|<script|<foreignObject|\son\w+=/i)
  })

  it('has a transparent ground: no background rectangle', () => {
    expect(doc.querySelector('rect')).toBeNull()
  })

  it('uses a dark ring for a light color scheme and a cream ring for a dark one', () => {
    const css = doc.querySelector('style')!.textContent!
    expect(css).toMatch(/^\.ring\{stroke:#12141A\}/)
    expect(css).toMatch(/@media \(prefers-color-scheme:dark\)\{\.ring\{stroke:#F2EFE8\}\}/)
  })

  it('keeps the dot in the accent color on both themes', () => {
    const dot = doc.querySelectorAll('circle')[1]!
    expect(dot.getAttribute('fill')).toBe('#FF6B47')
    expect(dot.getAttribute('class')).toBeNull()
  })

  it('keeps the ring inside its 64 x 64 canvas', () => {
    const ring = doc.querySelector('circle.ring')!
    const outer = Number(ring.getAttribute('r')) + Number(ring.getAttribute('stroke-width')) / 2
    expect(32 + outer).toBeLessThanOrEqual(64)
    expect(32 - outer).toBeGreaterThanOrEqual(0)
  })
})

describe('index.html', () => {
  it('has exactly one title, viewport, charset and root element', () => {
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html.match(/name="viewport"/g)).toHaveLength(1)
    expect(html.match(/charset=/gi)).toHaveLength(1)
    expect(html.match(/id="app"/g)).toHaveLength(1)
  })

  it('links only icon files that exist in public/', () => {
    const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="\/([^"]+)"/g)].map((m) => m[1]!)
    expect([...hrefs].sort()).toEqual(['apple-touch-icon.png', 'favicon.ico', 'favicon.svg'])
    for (const href of hrefs) expect(() => read(`public/${href}`)).not.toThrow()
  })

  it('sets the theme color to the dark ground of the icon tile', () => {
    expect(html).toContain('<meta name="theme-color" content="#12141a">')
  })

  it('declares the type of the SVG icon and the size of the .ico', () => {
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any">')
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="48x48">')
  })
})

describe('icon script', () => {
  const script = read('scripts/make-icons.mjs').toString()
  const pkg = JSON.parse(read('package.json').toString()) as { scripts: Record<string, string> }
  const brandMark = read('src/components/BrandMark.vue').toString()
  const svg = read('public/favicon.svg').toString()
  const geometry = (name: string) => {
    const m = new RegExp(`const ${name} = \\{ sw: (\\d+), dash: '([^']+)', dot: (\\d+) \\}`).exec(script)
    expect(m).not.toBeNull()
    return { sw: m![1]!, dash: m![2]!, dot: m![3]! }
  }

  it('is run by npm run icons, and that file exists', () => {
    const file = /^node (\S+)$/.exec(pkg.scripts.icons ?? '')?.[1]
    expect(file).toBe('scripts/make-icons.mjs')
    expect(() => read(file!)).not.toThrow()
  })

  it('draws the full mark with the same stroke, dashes and dot as BrandMark.vue', () => {
    const full = geometry('FULL')
    expect(brandMark).toContain(`stroke-width="${full.sw}"`)
    expect(brandMark).toContain(`stroke-dasharray="${full.dash}"`)
    expect(brandMark).toMatch(new RegExp(`r="${full.dot}" fill="var\\(--accent\\)"`))
  })

  it('draws the small mark in favicon.svg with the geometry of the script', () => {
    const small = geometry('SMALL')
    expect(svg).toContain(`stroke-width="${small.sw}" stroke-dasharray="${small.dash}"`)
    expect(svg).toContain(`r="${small.dot}" fill="#FF6B47"`)
  })

  it('uses the same ring center and radius in the script, BrandMark.vue and the SVG favicon', () => {
    expect(script).toContain('cx="32" cy="32" r="24"')
    expect(svg).toContain('cx="32" cy="32" r="24"')
    expect(brandMark).toMatch(/cx="32"\s+cy="32"\s+r="24"/)
  })

  it('uses the colors from the documentation', () => {
    const docs = read('../documentation/ui/branding.md').toString()
    for (const color of ['#FF6B47', '#F2EFE8', '#12141A']) {
      expect(script).toContain(color)
      expect(docs).toContain(color)
    }
  })

  it('has dash patterns that close the ring with whole perforations (12 full, 8 small)', () => {
    for (const [name, count] of [['FULL', 12], ['SMALL', 8]] as const) {
      const period = geometry(name).dash.split(' ').reduce((sum, n) => sum + Number(n), 0)
      expect(period * count).toBeCloseTo(2 * Math.PI * 24, 0)
    }
  })
})

describe('removed logo icon', () => {
  it('is no longer referenced by the layout or the icon component', () => {
    expect(read('src/components/AppLayout.vue').toString()).not.toMatch(/name="logo"/)
    expect(read('src/components/AppIcon.vue').toString()).not.toMatch(/logo/)
  })
})
