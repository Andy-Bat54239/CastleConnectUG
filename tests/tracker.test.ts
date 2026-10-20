import { beforeEach, describe, expect, it, vi } from 'vitest'

function fakeStorage(opts: { throwOnSet?: boolean } = {}) {
  const data = new Map<string, string>()
  return {
    setItem: (k: string, v: string) => {
      if (opts.throwOnSet) throw new Error('blocked')
      data.set(k, v)
    },
    getItem: (k: string) => data.get(k) ?? null,
    removeItem: (k: string) => void data.delete(k),
    data,
  }
}

const DAYS = 14
const T0 = Date.parse('2026-10-26T10:00:00+03:00')
const HOUR = 3_600_000

async function fresh(storage = fakeStorage()) {
  vi.resetModules()
  vi.stubGlobal('localStorage', storage)
  const store = await import('../src/lib/store')
  const tracker = await import('../src/lib/tracker')
  return { store, tracker, storage }
}

function fakeFetch(ok = true) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const send = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    if (!ok) throw new Error('offline')
    return { ok: true } as Response
  }) as unknown as typeof fetch
  return { send, calls }
}

describe('player counter on the phone', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('says nothing until the member taps Start', async () => {
    const { tracker } = await fresh()
    const f = fakeFetch()
    expect(await tracker.report(DAYS, T0, f.send)).toBe('quiet')
    expect(f.calls).toHaveLength(0)
  })

  it('reports the first tap, then stays quiet until there is news', async () => {
    const { store, tracker } = await fresh()
    const f = fakeFetch()
    store.markStarted(T0)
    expect(await tracker.report(DAYS, T0, f.send)).toBe('sent')
    expect(f.calls[0].url).toBe('/api/track')
    expect(f.calls[0].body).toMatchObject({ startedAt: T0, core: [], deeper: [] })
    expect(await tracker.report(DAYS, T0 + HOUR, f.send)).toBe('quiet')
    store.update(1, (d) => (d.coreDone = T0 + 2 * HOUR))
    expect(await tracker.report(DAYS, T0 + 2 * HOUR, f.send)).toBe('sent')
    expect(f.calls[1].body).toMatchObject({ core: [1], deeper: [] })
    store.update(1, (d) => (d.deeperDone = T0 + 3 * HOUR))
    expect(await tracker.report(DAYS, T0 + 3 * HOUR, f.send)).toBe('sent')
    expect(f.calls[2].body).toMatchObject({ core: [1], deeper: [1] })
  })

  it('uses the same random ID every time, and it carries no name', async () => {
    const { store, tracker, storage } = await fresh()
    const f = fakeFetch()
    store.markStarted(T0)
    await tracker.report(DAYS, T0, f.send)
    store.update(1, (d) => (d.coreDone = T0 + HOUR))
    await tracker.report(DAYS, T0 + HOUR, f.send)
    expect(f.calls[0].body.id).toBe(f.calls[1].body.id)
    expect(f.calls[0].body.id).toBe(storage.data.get('bg:id'))
    expect(Object.keys(f.calls[0].body).sort()).toEqual(['at', 'core', 'deeper', 'id', 'startedAt'])
  })

  it('keeps the ID after the page is closed and reopened', async () => {
    const storage = fakeStorage()
    const a = await fresh(storage)
    const f = fakeFetch()
    a.store.markStarted(T0)
    await a.tracker.report(DAYS, T0, f.send)
    const b = await fresh(storage)
    b.store.update(1, (d) => (d.coreDone = T0 + HOUR))
    await b.tracker.report(DAYS, T0 + HOUR, f.send)
    expect(f.calls[0].body.id).toBe(f.calls[1].body.id)
  })

  it('reports again every six hours with no news, so the server knows the phone is still playing', async () => {
    const { store, tracker } = await fresh()
    const f = fakeFetch()
    store.markStarted(T0)
    await tracker.report(DAYS, T0, f.send)
    expect(await tracker.report(DAYS, T0 + 5 * HOUR, f.send)).toBe('quiet')
    expect(await tracker.report(DAYS, T0 + 7 * HOUR, f.send)).toBe('sent')
  })

  it('tries again later when the connection fails, with the same news', async () => {
    const { store, tracker } = await fresh()
    store.markStarted(T0)
    expect(await tracker.report(DAYS, T0, fakeFetch(false).send)).toBe('failed')
    const f = fakeFetch()
    expect(await tracker.report(DAYS, T0 + HOUR, f.send)).toBe('sent')
    expect(f.calls[0].body.startedAt).toBe(T0)
  })

  it('tells the server when a counted member resets, so they stop being counted as started', async () => {
    const { store, tracker } = await fresh()
    const f = fakeFetch()
    store.markStarted(T0)
    await tracker.report(DAYS, T0, f.send)
    store.resetAll()
    expect(await tracker.report(DAYS, T0 + HOUR, f.send)).toBe('sent')
    expect(f.calls[1].body).toMatchObject({ startedAt: null, core: [], deeper: [] })
  })

  it('does nothing in a browser that will not keep an ID', async () => {
    const { store, tracker } = await fresh(fakeStorage({ throwOnSet: true }))
    const f = fakeFetch()
    store.markStarted(T0)
    expect(await tracker.report(DAYS, T0, f.send)).toBe('off')
    expect(f.calls).toHaveLength(0)
  })

  it('replaces a damaged ID', async () => {
    const storage = fakeStorage()
    storage.setItem('bg:id', 'not-an-id')
    const { store, tracker } = await fresh(storage)
    const f = fakeFetch()
    store.markStarted(T0)
    await tracker.report(DAYS, T0, f.send)
    expect(f.calls[0].body.id).toMatch(/^[0-9a-f]{32}$/)
  })

  it('is told about every change to the progress', async () => {
    const { store } = await fresh()
    const seen = vi.fn()
    store.onChange(seen)
    store.markStarted(T0)
    store.update(2, (d) => (d.note = 'hi'))
    store.resetAll()
    expect(seen).toHaveBeenCalledTimes(3)
  })

  it('never counts test links, the dev server, or a browser that cannot save', async () => {
    const { tracker } = await fresh()
    expect(tracker.shouldReport('', false, true)).toBe(true)
    expect(tracker.shouldReport('?preview=1', false, true)).toBe(false)
    expect(tracker.shouldReport('?now=2026-10-27T09:00:00%2B03:00', false, true)).toBe(false)
    expect(tracker.shouldReport('', true, true)).toBe(false)
    expect(tracker.shouldReport('', false, false)).toBe(false)
    expect(tracker.shouldReport('?v=3', false, true)).toBe(true)
  })
})
