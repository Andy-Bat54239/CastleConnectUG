import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTES, bundleApi } from '../scripts/build-api'

describe('the committed Vercel functions in api/', () => {
  it('are exactly what the source in server/ builds to, so they can never be out of date', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bg-api-'))
    await bundleApi(dir)
    for (const name of ROUTES) {
      expect(readFileSync(join(dir, `${name}.js`), 'utf8'), `api/${name}.js is out of date: run "npm run build:api" and commit it`).toBe(readFileSync(join(__dirname, '..', 'api', `${name}.js`), 'utf8'))
    }
  })

  it('stand on their own: no imports left to resolve at run time', () => {
    for (const name of ROUTES) {
      const code = readFileSync(join(__dirname, '..', 'api', `${name}.js`), 'utf8')
      expect(code).not.toMatch(/^import /m)
      expect(code).not.toMatch(/require\(/)
    }
  })
})
