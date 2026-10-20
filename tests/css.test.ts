import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the promise that the site still works on older Android phones. A few newer CSS features
 * are fine as long as the line above them gives older browsers something usable.
 */
const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8')
const lines = css.split('\n')

/** Newer CSS functions that older WebViews drop: the declaration needs a plain fallback just before it. */
const NEEDS_FALLBACK = ['color-mix(', 'clamp(', 'min(', 'max(']

describe('stylesheet compatibility', () => {
  it('gives every newer CSS function a plain fallback on the line before', () => {
    const problems: string[] = []
    lines.forEach((line, i) => {
      const fn = NEEDS_FALLBACK.find((f) => new RegExp(`(^|[^-\\w])${f.replace('(', '\\(')}`).test(line))
      if (!fn || !line.includes(':')) return
      const prop = line.split(':')[0].trim()
      const prev = (lines[i - 1] ?? '').trim()
      const hasFallback = prev.startsWith(prop + ':') && !NEEDS_FALLBACK.some((f) => prev.includes(f))
      if (!hasFallback) problems.push(`line ${i + 1}: "${line.trim()}" has no plain "${prop}" fallback above it`)
    })
    expect(problems).toEqual([])
  })

  it('keeps the board square on browsers without aspect-ratio', () => {
    expect(css).toMatch(/@supports not \(aspect-ratio: 1 \/ 1\)/)
  })

  it('does not use the shorthand `inset`, which older browsers ignore', () => {
    expect(css).not.toMatch(/^\s*inset:/m)
  })

  it('never follows the phone\'s own light/dark setting', () => {
    expect(css).not.toContain('prefers-color-scheme')
  })

  it('has the tablet and desktop breakpoints', () => {
    expect(css).toMatch(/@media \(min-width: 720px\)/)
    expect(css).toMatch(/@media \(min-width: 1000px\)/)
  })

  it('only applies hover effects where a mouse exists', () => {
    const bare = lines.filter((l) => /:hover/.test(l))
    expect(bare.length).toBeGreaterThan(0)
    const hoverBlock = css.slice(css.indexOf('@media (hover: hover)'))
    for (const l of bare) expect(hoverBlock).toContain(l.trim())
  })
})
