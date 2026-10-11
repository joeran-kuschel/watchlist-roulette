import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The files are read from the frontend folder, which is where vitest runs
const read = (path: string) => readFileSync(resolve(process.cwd(), path))
const html = read('index.html').toString()

describe('favicon and touch icon', () => {
  it('links the SVG favicon, the .ico fallback and the touch icon in index.html', () => {
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">')
    expect(html).toContain('<link rel="icon" href="/favicon.ico"')
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">')
    expect(html).toContain('<meta name="theme-color"')
  })

  it('has a vector favicon that follows the browser theme and keeps the accent dot', () => {
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
