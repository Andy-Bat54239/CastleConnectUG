import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const root = join(__dirname, '..')
const html = readFileSync(join(root, 'index.html'), 'utf8')
const main = readFileSync(join(root, 'src/main.ts'), 'utf8')
const css = readFileSync(join(root, 'src/styles.css'), 'utf8')

describe('loading screen', () => {
  it('is in index.html itself, so it paints before the main stylesheet and script arrive', () => {
    expect(html).toContain('id="splash"')
    expect(html).toMatch(/<style>[\s\S]*#splash[\s\S]*<\/style>/)
    expect(html).toContain('Bridge Grind')
  })
  it('shows the logo filling with its colours as the app loads', () => {
    expect(html).toContain('./icons/logo-full.png')
    expect(html).toContain('sp-ghost') // the faint grey outline
    expect(html).toContain('sp-fill') // the coloured logo, revealed from the bottom up
    expect(html).toMatch(/clip-path: inset\(calc\(100% - var\(--p/)
    expect(html).toContain("setProperty('--p'")
    expect(html).toMatch(/show\(100\)/) // fills to the top when the app is ready
  })
  it('always stays for at least two seconds, then leaves once the app is ready', () => {
    expect(html).toMatch(/MIN_MS = 2000/)
    expect(html).toMatch(/isReady && elapsed >= MIN_MS/) // ready early: waits for the two seconds
    expect(html).toMatch(/Date\.now\(\) - started >= MIN_MS\) leave\(\)/) // ready late: leaves at once
    expect(html).toMatch(/Math\.min\(target, 92\)/) // never looks finished before the app is ready
    expect(html).not.toMatch(/started < 300/) // the old "skip it if the app is quick" shortcut is gone
  })
  it('is taken away by the app once its first screen is on the page', () => {
    expect(html).toContain('window.__bgReady')
    expect(main).toContain('__bgReady')
    // every route must reach ready(): home, and the three lazily loaded screens
    expect((main.match(/\.finally\(ready\)/g) ?? []).length).toBe(3)
    expect(main).toMatch(/mountHome\(root\)\s*\n\s*ready\(\)/)
  })
  it('says so when loading is slow or fails, and offers a way to try again', () => {
    expect(html).toContain('sp-slow')
    expect(html).toContain('location.reload()')
    expect(html).toMatch(/tagName === 'SCRIPT'/)
  })
  it('follows the member\'s theme choice, never the phone\'s setting, and respects reduced motion', () => {
    expect(html).toContain(":root[data-theme='dark'] #splash")
    expect(html).not.toContain('prefers-color-scheme')
    expect(html).toContain('prefers-reduced-motion')
    expect(css).toContain('.loading-view')
  })
})

/** Runs the loading screen's inline script against a tiny fake page, so its timing can be tested with fake timers. */
function runSplash() {
  const classes = new Set<string>()
  const vars: Record<string, string> = {}
  let removed = false
  const el = {
    style: { setProperty: (k: string, v: string) => { vars[k] = v } },
    classList: { add: (...c: string[]) => c.forEach((n) => classes.add(n)) },
    parentNode: { removeChild: () => { removed = true } },
  }
  const doc = { getElementById: () => el, addEventListener: () => {} }
  const win: { __bgReady?: () => void } = {}
  const source = html.match(/<script>\s*\/\/ The loading screen always[\s\S]*?<\/script>/)![0].replace(/^<script>|<\/script>$/g, '')
  new Function('document', 'window', source)(doc, win)
  return { classes, fill: () => Number(vars['--p']), win, removed: () => removed }
}

describe('loading screen timing', () => {
  afterEach(() => vi.useRealTimers())

  it('stays for two seconds even when the app is ready at once, with the logo full before it leaves', () => {
    vi.useFakeTimers()
    const s = runSplash()
    vi.advanceTimersByTime(100)
    s.win.__bgReady!()
    vi.advanceTimersByTime(1800) // 1.9 s in
    expect(s.classes.has('done')).toBe(false)
    expect(s.fill()).toBeGreaterThan(95)
    vi.advanceTimersByTime(200) // 2.1 s in
    expect(s.classes.has('done')).toBe(true)
    expect(s.fill()).toBe(100)
    vi.advanceTimersByTime(700)
    expect(s.removed()).toBe(true)
  })

  it('waits for a slow app, never looks finished before it, then fills to the top and leaves', () => {
    vi.useFakeTimers()
    const s = runSplash()
    vi.advanceTimersByTime(3500)
    expect(s.classes.has('done')).toBe(false)
    expect(s.fill()).toBeLessThanOrEqual(92)
    s.win.__bgReady!()
    expect(s.fill()).toBe(100)
    expect(s.classes.has('done')).toBe(false) // a short pause so the last fill is seen
    vi.advanceTimersByTime(600)
    expect(s.classes.has('done')).toBe(true)
    vi.advanceTimersByTime(700)
    expect(s.removed()).toBe(true)
  })

  it('keeps waiting, and says so after nine seconds, if the app never arrives', () => {
    vi.useFakeTimers()
    const s = runSplash()
    vi.advanceTimersByTime(8900)
    expect(s.classes.has('slow')).toBe(false)
    vi.advanceTimersByTime(200)
    expect(s.classes.has('slow')).toBe(true)
    expect(s.classes.has('done')).toBe(false)
  })
})
