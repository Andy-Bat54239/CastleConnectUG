import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('player counter wiring', () => {
  it('has the two Vercel functions in api/, on the routes the site calls', () => {
    for (const name of ['track', 'stats']) {
      expect(existsSync(join(root, `api/${name}.js`))).toBe(true)
      expect(read(`api/${name}.js`)).toContain('export {')
      expect(existsSync(join(root, `server/${name}.ts`))).toBe(true)
    }
    expect(read('src/lib/tracker.ts')).toContain("'/api/track'")
    expect(read('public/stats.html')).toContain("'/api/stats'")
  })

  it('reads the secret key from the host\'s environment, never from the repository', () => {
    expect(read('src/lib/statsRoutes.ts')).toContain('env.STATS_KEY')
    // the repository is public: no key may be written into any file that ships or runs
    const shipped = ['public/stats.html', 'src/lib/statsHandlers.ts', 'src/lib/statsRoutes.ts', 'src/lib/tracker.ts', 'vercel.json', 'api/stats.js', 'api/track.js']
    for (const f of shipped) expect(read(f)).not.toMatch(/STATS_KEY\s*=\s*["']?[A-Za-z0-9]{12,}/)
  })

  it('keeps the service worker away from the counter, so numbers are never served from a cache', () => {
    const sw = read('scripts/sw-template.js')
    expect(sw).toContain("'/api/'")
    expect(sw).toContain("'/stats.html'")
  })

  it('keeps the stats page out of search engines and out of caches', () => {
    expect(read('public/stats.html')).toContain('noindex')
    const headers = JSON.parse(read('vercel.json')).headers as { source: string; headers: { key: string; value: string }[] }[]
    const stats = headers.find((h) => h.source === '/stats.html')!
    expect(stats.headers).toContainEqual({ key: 'Cache-Control', value: 'no-store' })
    expect(stats.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow' })
  })

  it('tells Vercel how to build the site, and keeps the page and service worker fresh', () => {
    const v = JSON.parse(read('vercel.json'))
    expect(v.buildCommand).toBe('npm run build')
    expect(v.outputDirectory).toBe('dist')
    const rule = (source: string) => v.headers.find((h: { source: string }) => h.source === source)?.headers ?? []
    expect(rule('/sw.js')).toContainEqual({ key: 'Cache-Control', value: 'no-cache' })
    expect(rule('/index.html')).toContainEqual({ key: 'Cache-Control', value: 'no-cache' })
    expect(rule('/assets/(.*)')).toContainEqual({ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' })
  })

  it('builds the stats page from text only, so a stored value can never inject markup', () => {
    expect(read('public/stats.html')).not.toContain('innerHTML')
  })

  it('tells members they are counted, and that no names are kept', () => {
    expect(read('src/ui/home.ts')).toMatch(/we count how many people start and finish each day/)
    expect(read('src/ui/home.ts')).toMatch(/never ask for a name/)
  })

  it('starts counting when the app starts, but not on the dev server or test links', () => {
    expect(read('src/main.ts')).toContain('startTracking(TOTAL_DAYS, location.search, import.meta.env.DEV)')
  })

  it('has no leftovers from the old host in the counter', () => {
    expect(existsSync(join(root, 'netlify'))).toBe(false)
    expect(existsSync(join(root, 'netlify.toml'))).toBe(false)
    expect(read('package.json')).not.toContain('@netlify/blobs')
  })
})
