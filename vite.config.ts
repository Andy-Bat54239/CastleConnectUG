import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'

/**
 * Writes dist/sw.js after the build. The service worker precaches only the app
 * shell (small); lesson chunks are cached the first time a day is opened, so a
 * member's first visit does not download all 14 days over mobile data.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'bridge-grind-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    closeBundle() {
      const files: string[] = []
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name)
          if (statSync(p).isDirectory()) walk(p)
          else files.push(relative(outDir, p).split('\\').join('/'))
        }
      }
      walk(outDir)
      // Precache exactly what index.html needs to render (its scripts, styles, icons), so the
      // list cannot drift out of sync with the build. Lesson chunks are cached on first use.
      const html = readFileSync(join(outDir, 'index.html'), 'utf8')
      const referenced = [...html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)].map((m) => m[1])
      const shell = [...new Set(['index.html', ...referenced])].filter((f) => files.includes(f))
      for (const f of ['icons/icon-192.png']) if (files.includes(f) && !shell.includes(f)) shell.push(f)
      const hash = createHash('sha1')
      for (const f of shell) hash.update(f).update(readFileSync(join(outDir, f)))
      const version = hash.digest('hex').slice(0, 10)
      const sw = readFileSync(new URL('./scripts/sw-template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__SHELL__', JSON.stringify(['./', ...shell.filter((f) => f !== 'index.html')]))
      writeFileSync(join(outDir, 'sw.js'), sw)
    },
  }
}

export default defineConfig({
  // Relative base so the site works from any host path (Cloudflare Pages, GitHub Pages project sites, ...).
  base: './',
  plugins: [serviceWorker()],
  // chess.js uses BigInt, so Chrome 67 (mid-2018) is the real floor. WhatsApp's in-app browser tracks system WebView.
  build: { target: ['chrome67', 'safari14', 'firefox68'], cssCodeSplit: false, assetsInlineLimit: 0, sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
