import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// jsdom does not apply stylesheets, so the rules are checked in the source (vitest runs in the frontend folder)
const css = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8')

describe('dropdown chevron', () => {
  const select = /^select\.input \{([^}]*)\}/m.exec(css)?.[1] ?? ''

  it('draws its own chevron 14px from the right edge and keeps the text clear of it', () => {
    expect(select).toContain('appearance: none')
    expect(select).toContain('background-position: right 14px center')
    expect(select).toContain('background-size: 16px 16px')
    // 14px edge + 16px chevron + 12px gap
    expect(select).toContain('padding-right: 42px')
    expect(select).toMatch(/background-image: url\("data:image\/svg\+xml,[^"]*M5 9l7 7 7-7/)
  })

  it('uses the text color for the chevron', () => {
    const text = /--text: (#[0-9a-f]{6})/i.exec(css)?.[1]
    expect(text).toBeTruthy()
    expect(select).toContain(`stroke='%23${text?.slice(1)}'`)
  })

  it('falls back to the native arrow in forced-colors mode, where background images disappear', () => {
    const forced = /@media \(forced-colors: active\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
    expect(forced).toContain('select.input')
    expect(forced).toContain('appearance: auto')
    // the native arrow is back, so the room reserved for the drawn chevron goes too
    expect(forced).toContain('padding-right: 12px')
  })

  it('has the rule outside the forced-colors block, so it applies by default', () => {
    expect(css.replace(/@media \(forced-colors: active\) \{[\s\S]*?\n\}/, '')).toMatch(
      /^select\.input \{/m,
    )
  })

  it('is used by every select in the app, so a new dropdown without class "input" is caught', () => {
    const files = import.meta.glob('../**/*.vue', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const tags = Object.entries(files).flatMap(([file, source]) =>
      [...source.matchAll(/<select\b[^>]*>/g)].map((m) => ({ file, tag: m[0] })),
    )
    expect(tags.length).toBeGreaterThanOrEqual(4)
    for (const { tag } of tags) {
      expect(tag).toMatch(/\sclass="(?:[^"]*\s)?input(?:\s[^"]*)?"/)
    }
  })
})
