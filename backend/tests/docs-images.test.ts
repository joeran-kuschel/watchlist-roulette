import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const imagesDir = join(root, 'documentation/ui/images')

const markdownFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : markdownFiles(join(dir, entry.name))
      : entry.name.endsWith('.md') ? [join(dir, entry.name)] : [],
  )

const images = [join(root, 'README.md'), ...markdownFiles(join(root, 'documentation'))].flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)].map(([, alt, target]) => ({
    file: relative(root, file),
    alt: alt!,
    target: target!,
    path: resolve(dirname(file), target!),
  })),
)

describe('screenshots in the documentation', () => {
  it('every image in the Markdown files exists and has a text alternative of a sensible length', () => {
    expect(images.length).toBeGreaterThanOrEqual(5)
    for (const image of images) {
      expect(existsSync(image.path), `${image.file} points at ${image.target}`).toBe(true)
      expect(image.alt.length, `${image.file}: alt text of ${image.target}`).toBeGreaterThan(40)
    }
  })

  it('shows each of the four main pages in its own chapter', () => {
    const shown = (file: string, name: string) =>
      images.some((i) => i.file === file && i.path === join(imagesDir, name))
    expect(shown('documentation/ui/roulette.md', 'roulette.png')).toBe(true)
    expect(shown('documentation/ui/watchlist.md', 'watchlist.png')).toBe(true)
    expect(shown('documentation/ui/import.md', 'import.png')).toBe(true)
    expect(shown('documentation/ui/film-details.md', 'film-details.png')).toBe(true)
  })

  it('has no unused image files, and keeps each one small', () => {
    for (const name of readdirSync(imagesDir)) {
      expect(images.some((i) => i.path === join(imagesDir, name)), `${name} is not used`).toBe(true)
      expect(statSync(join(imagesDir, name)).size, `${name} is larger than 400 KB`).toBeLessThan(400 * 1024)
    }
  })

  it('has real PNG files that are 1280 px wide, the width the screenshot script uses', () => {
    for (const name of readdirSync(imagesDir)) {
      const bytes = readFileSync(join(imagesDir, name))
      expect(bytes.subarray(0, 8).toString('hex'), `${name} is not a PNG`).toBe('89504e470d0a1a0a')
      expect(bytes.readUInt32BE(16), `${name} width`).toBe(1280)
    }
  })
})
