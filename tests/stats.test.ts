import { describe, expect, it } from 'vitest'
import { buildSnapshot, mergeRecord, newId, parseSnapshot, snapshotKey, summarise, validId, type PlayerRecord } from '../src/lib/stats'
import { handleStats, handleTrack, type PlayerStore } from '../src/lib/statsHandlers'

const NOW = Date.parse('2026-10-27T09:00:00+03:00')
const DAYS = 14
const id = (n: number) => n.toString(16).padStart(32, '0')
const picture = (n: number, over: Record<string, unknown> = {}) => ({ id: id(n), startedAt: Date.parse('2026-10-26T10:00:00+03:00'), core: [1], deeper: [], at: NOW, ...over })

function memoryStore(): PlayerStore & { data: Map<string, PlayerRecord> } {
  const data = new Map<string, PlayerRecord>()
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, r) => void data.set(k, r),
    all: async () => [...data.values()],
  }
}

describe('anonymous IDs', () => {
  it('makes 32 hex characters, and a different one each time', () => {
    const a = newId()
    expect(validId(a)).toBe(true)
    expect(newId()).not.toBe(a)
  })
  it('still works with no secure random numbers (an old browser)', () => {
    let n = 0
    const fake = () => ((n += 0.37) % 1)
    const original = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    try {
      expect(validId(newId(fake))).toBe(true)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })
  it('only accepts the right shape', () => {
    for (const bad of ['', 'abc', id(255).toUpperCase(), id(1) + '0', 42, null, undefined, '../etc/passwd']) expect(validId(bad)).toBe(false)
  })
})

describe('what a phone may report', () => {
  it('accepts a good picture, sorting the days and dropping repeats', () => {
    const s = parseSnapshot(picture(1, { core: [3, 1, 3, 2], deeper: [2] }), NOW, DAYS)!
    expect(s.core).toEqual([1, 2, 3])
    expect(s.deeper).toEqual([2])
  })
  it('accepts someone who has not started (or who reset)', () => {
    expect(parseSnapshot(picture(1, { startedAt: null, core: [] }), NOW, DAYS)!.startedAt).toBeNull()
  })
  it('rejects anything that does not fit', () => {
    const bad: Record<string, unknown>[] = [
      { id: 'nope' },
      { core: [0] },
      { core: [15] },
      { core: [1.5] },
      { core: 'all' },
      { core: Array.from({ length: 15 }, (_, i) => i + 1) },
      { deeper: [99] },
      { startedAt: 'yesterday' },
      { startedAt: Date.parse('2001-01-01') },
      { startedAt: Date.parse('2200-01-01') },
      { at: 'now' },
    ]
    for (const over of bad) expect(parseSnapshot(picture(1, over), NOW, DAYS)).toBeNull()
    expect(parseSnapshot(null, NOW, DAYS)).toBeNull()
    expect(parseSnapshot('text', NOW, DAYS)).toBeNull()
  })
  it('never lets a wrong phone clock put someone in the future', () => {
    const s = parseSnapshot(picture(1, { startedAt: NOW + 5 * 86_400_000, at: NOW + 9 * 86_400_000 }), NOW, DAYS)!
    expect(s.startedAt).toBe(NOW)
    expect(s.at).toBe(NOW)
  })
})

describe('keeping one record per ID', () => {
  const first = mergeRecord(null, parseSnapshot(picture(1), NOW, DAYS)!, NOW)!
  it('starts a record', () => {
    expect(first.first).toBe(NOW)
    expect(first.seen).toBe(NOW)
  })
  it('replaces it with a newer picture and remembers the first time', () => {
    const later = NOW + 3_600_000
    const next = mergeRecord(first, parseSnapshot(picture(1, { core: [1, 2], at: later }), later, DAYS)!, later)!
    expect(next.core).toEqual([1, 2])
    expect(next.first).toBe(NOW)
    expect(next.seen).toBe(later)
  })
  it('ignores an older picture that arrives late', () => {
    const later = NOW + 3_600_000
    const newer = mergeRecord(first, parseSnapshot(picture(1, { core: [1, 2], at: later }), later, DAYS)!, later)!
    expect(mergeRecord(newer, parseSnapshot(picture(1, { core: [1], at: NOW }), later, DAYS)!, later)).toBeNull()
  })
  it('gives the same key for the same news and a new key when something changes', () => {
    const a = snapshotKey({ startedAt: 1, core: [1], deeper: [] })
    expect(snapshotKey({ startedAt: 1, core: [1], deeper: [] })).toBe(a)
    expect(snapshotKey({ startedAt: 1, core: [1, 2], deeper: [] })).not.toBe(a)
    expect(snapshotKey({ startedAt: 1, core: [1], deeper: [1] })).not.toBe(a)
    expect(snapshotKey({ startedAt: null, core: [1], deeper: [] })).not.toBe(a)
  })
})

describe('building a picture from the phone\'s own progress', () => {
  it('lists the finished days', () => {
    const p = { startedAt: NOW, days: { '1': { coreDone: 5, deeperDone: 6 }, '2': { coreDone: 7 }, '3': {}, '15': { coreDone: 9 } } }
    const s = buildSnapshot(id(1), p, DAYS, NOW)
    expect(s.core).toEqual([1, 2])
    expect(s.deeper).toEqual([1])
    expect(s.startedAt).toBe(NOW)
  })
  it('has no start until the member taps Start', () => {
    expect(buildSnapshot(id(1), { days: {} }, DAYS, NOW).startedAt).toBeNull()
    expect(buildSnapshot(id(1), { startedAt: Number.NaN, days: {} }, DAYS, NOW).startedAt).toBeNull()
  })
})

describe('the totals', () => {
  const rec = (n: number, over: Partial<PlayerRecord> = {}): PlayerRecord => ({ ...(picture(n) as unknown as PlayerRecord), first: NOW, seen: NOW, ...over })
  const all = Array.from({ length: 14 }, (_, i) => i + 1)

  it('counts only people who tapped Start', () => {
    const s = summarise([rec(1), rec(2, { startedAt: null, core: [] })], NOW, DAYS)
    expect(s.players).toBe(1)
  })

  it('counts who finished each day, who went deeper, who finished everything, and who is still active', () => {
    const s = summarise(
      [
        rec(1, { core: [1, 2, 3], deeper: [1, 2] }),
        rec(2, { core: [1, 2], deeper: [] }),
        rec(3, { core: all, deeper: all }),
        rec(4, { core: [], deeper: [], seen: NOW - 4 * 86_400_000 }), // started, then quiet for four days
      ],
      NOW,
      DAYS,
    )
    expect(s.players).toBe(4)
    expect(s.active3d).toBe(3)
    expect(s.finishedAll).toBe(1)
    expect(s.wentDeeper).toBe(2)
    expect(s.days[0]).toEqual({ day: 1, core: 3, deeper: 2 })
    expect(s.days[2]).toEqual({ day: 3, core: 2, deeper: 1 })
    expect(s.days[13]).toEqual({ day: 14, core: 1, deeper: 1 })
    expect(s.where).toEqual([
      { lastDay: 0, people: 1 },
      { lastDay: 2, people: 1 },
      { lastDay: 3, people: 1 },
      { lastDay: 14, people: 1 },
    ])
  })

  it('counts when people started, by Kampala day', () => {
    const s = summarise(
      [
        rec(1, { startedAt: Date.parse('2026-10-22T23:30:00+03:00') }),
        rec(2, { startedAt: Date.parse('2026-10-22T01:00:00+03:00') }),
        rec(3, { startedAt: Date.parse('2026-10-23T00:10:00+03:00') }),
      ],
      NOW,
      DAYS,
    )
    expect(s.joined).toEqual([
      { date: Date.parse('2026-10-22T00:00:00+03:00'), people: 2 },
      { date: Date.parse('2026-10-23T00:00:00+03:00'), people: 1 },
    ])
  })

  it('is all zeros before anyone starts', () => {
    const s = summarise([], NOW, DAYS)
    expect(s).toMatchObject({ players: 0, active3d: 0, finishedAll: 0, wentDeeper: 0, where: [], joined: [] })
    expect(s.days).toHaveLength(14)
  })
})

describe('POST /api/track', () => {
  const post = (body: unknown) => new Request('https://x.test/api/track', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })

  it('stores a good picture, and a second one replaces it', async () => {
    const store = memoryStore()
    expect((await handleTrack(post(picture(1)), store, NOW, DAYS)).status).toBe(200)
    expect(store.data.get(id(1))!.core).toEqual([1])
    const later = NOW + 1000
    await handleTrack(post(picture(1, { core: [1, 2], at: later })), store, later, DAYS)
    expect(store.data.size).toBe(1)
    expect(store.data.get(id(1))!.core).toEqual([1, 2])
  })

  it('does not let an older picture undo a newer one', async () => {
    const store = memoryStore()
    await handleTrack(post(picture(1, { core: [1, 2], at: NOW })), store, NOW, DAYS)
    const res = await handleTrack(post(picture(1, { core: [1], at: NOW - 5000 })), store, NOW + 10, DAYS)
    expect(await res.json()).toEqual({ ok: true, stored: false })
    expect(store.data.get(id(1))!.core).toEqual([1, 2])
  })

  it('refuses other methods, junk, and oversized messages', async () => {
    const store = memoryStore()
    expect((await handleTrack(new Request('https://x.test/api/track'), store, NOW, DAYS)).status).toBe(405)
    expect((await handleTrack(post('not json'), store, NOW, DAYS)).status).toBe(400)
    expect((await handleTrack(post({ hello: 'world' }), store, NOW, DAYS)).status).toBe(400)
    expect((await handleTrack(post({ ...picture(1), pad: 'x'.repeat(3000) }), store, NOW, DAYS)).status).toBe(413)
    expect(store.data.size).toBe(0)
  })

  it('is never cached', async () => {
    const res = await handleTrack(post(picture(1)), memoryStore(), NOW, DAYS)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('GET /api/stats', () => {
  const KEY = 'a-long-secret-key-for-tests'
  const get = (auth?: string) => new Request('https://x.test/api/stats', { headers: auth ? { authorization: auth } : {} })
  const seeded = async () => {
    const store = memoryStore()
    await handleTrack(new Request('https://x.test/api/track', { method: 'POST', body: JSON.stringify(picture(1, { core: [1, 2], deeper: [1] })) }), store, NOW, DAYS)
    return store
  }

  it('is closed when no key has been set, so it never falls back to an open page', async () => {
    const store = await seeded()
    expect((await handleStats(get('Bearer anything'), store, undefined, NOW, DAYS)).status).toBe(503)
    expect((await handleStats(get('Bearer short'), store, 'short', NOW, DAYS)).status).toBe(503)
    expect((await handleStats(get(`Bearer ${KEY}`), store, '', NOW, DAYS)).status).toBe(503)
  })

  it('refuses a missing or wrong key', async () => {
    const store = await seeded()
    expect((await handleStats(get(), store, KEY, NOW, DAYS)).status).toBe(401)
    expect((await handleStats(get('Bearer wrong-key-wrong-key-wrong'), store, KEY, NOW, DAYS)).status).toBe(401)
    expect((await handleStats(get(`Bearer ${KEY}x`), store, KEY, NOW, DAYS)).status).toBe(401)
    expect((await handleStats(get(KEY.slice(0, -1)), store, KEY, NOW, DAYS)).status).toBe(401)
  })

  it('gives the totals to whoever holds the key, with the day titles, and never from a cache', async () => {
    const store = await seeded()
    const res = await handleStats(get(`Bearer ${KEY}`), store, KEY, NOW, DAYS, ['One', 'Two'])
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body).toMatchObject({ players: 1, wentDeeper: 1, titles: ['One', 'Two'] })
    expect(body.days[1]).toEqual({ day: 2, core: 1, deeper: 0 })
  })

  it('does not reveal any ID or other private detail', async () => {
    const store = await seeded()
    const text = await (await handleStats(get(`Bearer ${KEY}`), store, KEY, NOW, DAYS)).text()
    expect(text).not.toContain(id(1))
  })

  it('refuses other methods', async () => {
    expect((await handleStats(new Request('https://x.test/api/stats', { method: 'POST' }), memoryStore(), KEY, NOW, DAYS)).status).toBe(405)
  })
})
