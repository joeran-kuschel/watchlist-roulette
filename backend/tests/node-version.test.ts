import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(join(root, file), 'utf8')
const json = (file: string) => JSON.parse(read(file))

const nvmrc = read('.nvmrc').trim()
const dockerfiles = ['backend/Dockerfile', 'frontend/Dockerfile']

describe('Node version', () => {
  it('is a single major version in .nvmrc', () => {
    expect(nvmrc).toMatch(/^\d+$/)
  })

  it.each(['backend/package.json', 'frontend/package.json'])('%s engines accept only the .nvmrc major', (file) => {
    expect(json(file).engines.node).toBe(`^${nvmrc}.0.0`)
  })

  it.each(dockerfiles)('%s uses the .nvmrc major in every stage', (file) => {
    const images = [...read(file).matchAll(/^FROM (\S+)/gm)].map((m) => m[1])
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) {
      if (image!.startsWith('node:')) expect(image).toMatch(new RegExp(`^node:${nvmrc}-alpine$`))
    }
    expect(images.some((i) => i!.startsWith('node:'))).toBe(true)
  })

  it('is the version CI runs backend and frontend on', () => {
    const versions = [...read('.github/workflows/ci.yml').matchAll(/node-version: *(\S+)/g)].map((m) => m[1])
    expect(versions.length).toBeGreaterThan(0)
    for (const version of versions) expect(version).toBe(nvmrc)
  })

  it.each(['backend/package-lock.json', 'frontend/package-lock.json'])('%s records the same engines as package.json', (file) => {
    const pkg = file.replace('package-lock', 'package')
    expect(json(file).packages[''].engines.node).toBe(json(pkg).engines.node)
  })
})
