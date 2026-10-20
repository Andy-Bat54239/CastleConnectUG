import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('player counter wiring', () => {
  it('has the two Netlify functions, on the routes the site calls', () => {
    expect(read('netlify.toml')).toMatch(/\[functions\]\s*\n\s*directory = "netlify\/functions"/)
    expect(read('netlify/functions/track.ts')).toContain("path: '/api/track'")
    expect(read('netlify/functions/stats.ts')).toContain("path: '/api/stats'")
    expect(read('src/lib/tracker.ts')).toContain("'/api/track'")
    expect(read('public/stats.html')).toContain("'/api/stats'")
  })

  it('reads the secret key from Netlify\'s environment, never from the repository', () => {
    expect(read('netlify/functions/stats.ts')).toContain('process.env.STATS_KEY')
    // the repository is public: no key may be written into any file that ships or runs
    const shipped = ['public/stats.html', 'src/lib/statsHandlers.ts', 'src/lib/tracker.ts', 'netlify.toml', 'public/_headers']
    for (const f of shipped) expect(read(f)).not.toMatch(/STATS_KEY\s*=\s*["']?[A-Za-z0-9]{12,}/)
  })

  it('keeps the service worker away from the counter, so numbers are never served from a cache', () => {
    const sw = read('scripts/sw-template.js')
    expect(sw).toContain("'/api/'")
    expect(sw).toContain("'/stats.html'")
  })

  it('keeps the stats page out of search engines and out of caches', () => {
    expect(read('public/stats.html')).toContain('noindex')
    expect(read('public/_headers')).toMatch(/\/stats\.html\s*\n\s*Cache-Control: no-store\s*\n\s*X-Robots-Tag: noindex/)
  })

  it('builds the stats page from text only, so a stored value can never inject markup', () => {
    expect(read('public/stats.html')).not.toContain('innerHTML')
  })

  it('tells members they are counted, and that no names are kept', () => {
    expect(read('src/ui/home.ts')).toMatch(/we count how many people start and finish each day/)
    expect(read('src/ui/home.ts')).toMatch(/never ask for a name/)
  })

  it('starts counting when the app starts, but not on the dev server or test links', () => {
    const main = read('src/main.ts')
    expect(main).toContain('startTracking(TOTAL_DAYS, location.search, import.meta.env.DEV)')
    expect(existsSync(join(root, 'netlify/functions/track.ts'))).toBe(true)
  })
})
