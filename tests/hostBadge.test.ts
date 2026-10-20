import { describe, expect, it } from 'vitest'
import { hostBadgeShown } from '../src/lib/hostBadge'

/** A page stand-in that answers the one question the detector asks. */
const page = (scripts: string[]) => ({
  querySelector: (sel: string) => {
    const needle = /src\*="([^"]+)"/.exec(sel)?.[1]
    return needle && scripts.some((s) => s.includes(needle)) ? ({} as Element) : null
  },
})

describe('host badge detection', () => {
  it("sees Netlify's injected badge script", () => {
    expect(hostBadgeShown(page(['./assets/index-abc.js', '/.netlify/scripts/hud?variant=public']))).toBe(true)
  })
  it('sees nothing on a page without it', () => {
    expect(hostBadgeShown(page(['./assets/index-abc.js']))).toBe(false)
    expect(hostBadgeShown(page([]))).toBe(false)
  })
})
