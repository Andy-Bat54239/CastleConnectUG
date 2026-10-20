import { beforeEach, describe, expect, it, vi } from 'vitest'

function fakeStorage(opts: { throwOnSet?: boolean; throwOnGet?: boolean } = {}) {
  const data = new Map<string, string>()
  return {
    setItem: (k: string, v: string) => {
      if (opts.throwOnSet) throw new Error('blocked')
      data.set(k, v)
    },
    getItem: (k: string) => {
      if (opts.throwOnGet) throw new Error('blocked')
      return data.get(k) ?? null
    },
    removeItem: (k: string) => void data.delete(k),
    data,
  }
}

async function freshStore() {
  vi.resetModules()
  return await import('../src/lib/store')
}

describe('progress store', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves and reloads progress', async () => {
    const ls = fakeStorage()
    vi.stubGlobal('localStorage', ls)
    const a = await freshStore()
    a.update(2, (d) => {
      d.res['c0'] = { done: true, first: true, tries: 0 }
      d.pos.core = 1
    })
    expect(a.canSave()).toBe(true)
    const b = await freshStore() // simulates closing and reopening the page
    expect(b.getDay(2).res['c0'].first).toBe(true)
    expect(b.getDay(2).pos.core).toBe(1)
  })

  it('keeps working when storage is blocked (in-app browsers)', async () => {
    vi.stubGlobal('localStorage', fakeStorage({ throwOnSet: true, throwOnGet: true }))
    const s = await freshStore()
    expect(s.canSave()).toBe(false)
    s.update(1, (d) => (d.note = 'still works in memory'))
    expect(s.getDay(1).note).toBe('still works in memory')
  })

  it('works when localStorage does not exist at all', async () => {
    vi.stubGlobal('localStorage', undefined)
    const s = await freshStore()
    expect(s.canSave()).toBe(false)
    expect(() => s.update(1, (d) => (d.habits[0] = true))).not.toThrow()
  })

  it('survives corrupt saved data', async () => {
    const ls = fakeStorage()
    ls.data.set('bg:v1', '{not json')
    vi.stubGlobal('localStorage', ls)
    const s = await freshStore()
    expect(s.getDay(1).pos.core).toBe(0)
  })

  it('scores first-try answers only', async () => {
    vi.stubGlobal('localStorage', fakeStorage())
    const s = await freshStore()
    s.update(1, (d) => {
      d.res['c0'] = { done: true, first: true, tries: 0 }
      d.res['c1'] = { done: true, first: false, tries: 2 }
      d.res['c2'] = { done: true, first: true, tries: 0 }
    })
    expect(s.score(1, ['c0', 'c1', 'c2', 'c3'])).toEqual({ right: 2, total: 4 })
  })

  it('counts a day as done only when the core part is done', async () => {
    vi.stubGlobal('localStorage', fakeStorage())
    const s = await freshStore()
    s.update(1, (d) => (d.coreDone = Date.now()))
    s.update(2, (d) => (d.pos.core = 5))
    expect(s.doneCount()).toBe(1)
    expect(s.isCoreDone(1)).toBe(true)
    expect(s.isCoreDone(2)).toBe(false)
  })

  it('resets everything', async () => {
    const ls = fakeStorage()
    vi.stubGlobal('localStorage', ls)
    const s = await freshStore()
    s.update(1, (d) => (d.coreDone = 1))
    s.resetAll()
    expect(s.doneCount()).toBe(0)
  })

  it('remembers when the member tapped Start, and the first tap wins', async () => {
    const ls = fakeStorage()
    vi.stubGlobal('localStorage', ls)
    const a = await freshStore()
    expect(a.getStartedAt()).toBeUndefined()
    a.markStarted(1_000)
    a.markStarted(9_000) // opening the link or tapping again never moves the start
    expect(a.getStartedAt()).toBe(1_000)
    const b = await freshStore() // closing and reopening the page
    expect(b.getStartedAt()).toBe(1_000)
  })

  it('lets a member who started earlier set the day by hand, and clears it on reset', async () => {
    vi.stubGlobal('localStorage', fakeStorage())
    const s = await freshStore()
    s.markStarted(5_000)
    s.setStartedAt(2_000)
    expect(s.getStartedAt()).toBe(2_000)
    s.resetAll()
    expect(s.getStartedAt()).toBeUndefined()
  })

  it('ignores a damaged start time', async () => {
    const ls = fakeStorage()
    ls.setItem('bg:v1', JSON.stringify({ v: 1, days: {}, startedAt: 'soon' }))
    vi.stubGlobal('localStorage', ls)
    const s = await freshStore()
    expect(s.getStartedAt()).toBeUndefined()
  })
})
