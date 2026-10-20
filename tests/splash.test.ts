import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

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
