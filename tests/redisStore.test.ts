import { describe, expect, it } from 'vitest'
import { redisConfig, redisPlayerStore } from '../src/lib/redisStore'
import { handleStats, handleTrack, StorageMissing, type PlayerStore } from '../src/lib/statsHandlers'
import { NO_DATABASE, statsRoute, trackRoute } from '../src/lib/statsRoutes'

const NOW = Date.parse('2026-10-27T09:00:00+03:00')
const id = (n: number) => n.toString(16).padStart(32, '0')
const picture = (n: number, over: Record<string, unknown> = {}) => ({ id: id(n), startedAt: Date.parse('2026-10-26T10:00:00+03:00'), core: [1], deeper: [], at: NOW, ...over })

/** A stand-in for Upstash's REST interface: one hash in memory, the three commands we use, and a record of what was asked. */
function fakeUpstash(opts: { fail?: boolean } = {}) {
  const hashes = new Map<string, Map<string, string>>()
  const calls: { url: string; auth: string | null; command: string[] }[] = []
  const send = (async (url: string, init: RequestInit) => {
    const command = JSON.parse(String(init.body)) as string[]
    calls.push({ url, auth: new Headers(init.headers).get('authorization'), command })
    if (opts.fail) return new Response(JSON.stringify({ error: 'ERR boom' }), { status: 400 })
    const [name, key, field, value] = command
    const h = hashes.get(key) ?? new Map<string, string>()
    hashes.set(key, h)
    if (name === 'HSET') {
      const isNew = !h.has(field)
      h.set(field, value)
      return new Response(JSON.stringify({ result: isNew ? 1 : 0 }))
    }
    if (name === 'HGET') return new Response(JSON.stringify({ result: h.get(field) ?? null }))
    if (name === 'HGETALL') return new Response(JSON.stringify({ result: [...h.entries()].flat() }))
    return new Response(JSON.stringify({ error: 'unknown command' }), { status: 400 })
  }) as unknown as typeof fetch
  return { send, calls, hashes }
}

const ENV = { UPSTASH_REDIS_REST_URL: 'https://example.upstash.io/', UPSTASH_REDIS_REST_TOKEN: 'secret-token' }

describe('finding the database in the environment', () => {
  it('reads the Upstash names', () => {
    expect(redisConfig(ENV)).toEqual({ url: 'https://example.upstash.io', token: 'secret-token' })
  })
  it('reads the older KV names', () => {
    expect(redisConfig({ KV_REST_API_URL: 'https://kv.upstash.io', KV_REST_API_TOKEN: 't' })).toEqual({ url: 'https://kv.upstash.io', token: 't' })
  })
  it('reads names with a prefix, which Vercel lets you add when you connect a store', () => {
    expect(redisConfig({ STORAGE_KV_REST_API_URL: 'https://p.upstash.io', STORAGE_KV_REST_API_TOKEN: 'pt' })).toEqual({ url: 'https://p.upstash.io', token: 'pt' })
    expect(redisConfig({ COUNTER_UPSTASH_REDIS_REST_URL: 'https://q.upstash.io', COUNTER_UPSTASH_REDIS_REST_TOKEN: 'qt' })).toEqual({ url: 'https://q.upstash.io', token: 'qt' })
  })
  it('prefers the plain names, and never uses the read-only token', () => {
    const env = { ...ENV, STORAGE_KV_REST_API_URL: 'https://other.upstash.io', STORAGE_KV_REST_API_TOKEN: 'other', KV_REST_API_READ_ONLY_TOKEN: 'ro' }
    expect(redisConfig(env)).toEqual({ url: 'https://example.upstash.io', token: 'secret-token' })
    expect(redisConfig({ KV_REST_API_URL: 'https://kv.upstash.io', KV_REST_API_READ_ONLY_TOKEN: 'ro' })).toBeNull()
  })
  it('is null when there is no database, a half-set pair, or something that is not an address', () => {
    expect(redisConfig({})).toBeNull()
    expect(redisConfig({ UPSTASH_REDIS_REST_URL: 'https://example.upstash.io' })).toBeNull()
    expect(redisConfig({ UPSTASH_REDIS_REST_URL: 'nonsense', UPSTASH_REDIS_REST_TOKEN: 't' })).toBeNull()
    expect(redisConfig({ UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: 't' })).toBeNull()
  })
})

describe('the Redis store', () => {
  const config = { url: 'https://example.upstash.io', token: 'secret-token' }
  const record = { ...picture(1), first: NOW, seen: NOW } as never

  it('saves, reads back and lists records, all in one hash, signed with the token', async () => {
    const up = fakeUpstash()
    const store = redisPlayerStore(config, up.send)
    expect(await store.get(id(1))).toBeNull()
    await store.set(id(1), record)
    await store.set(id(2), { ...(record as object), id: id(2) } as never)
    expect(((await store.get(id(1))) as { id: string }).id).toBe(id(1))
    expect((await store.all()).map((r) => r.id).sort()).toEqual([id(1), id(2)])
    expect(up.hashes.size).toBe(1)
    expect(up.calls.every((c) => c.auth === 'Bearer secret-token' && c.url === 'https://example.upstash.io')).toBe(true)
    expect(up.calls.map((c) => c.command[0])).toEqual(['HGET', 'HSET', 'HSET', 'HGET', 'HGETALL'])
  })

  it('skips damaged entries instead of failing', async () => {
    const up = fakeUpstash()
    const store = redisPlayerStore(config, up.send)
    await store.set(id(1), record)
    ;[...up.hashes.values()][0].set('broken', '{not json')
    expect(await store.all()).toHaveLength(1)
  })

  it('throws when the database answers with an error', async () => {
    const store = redisPlayerStore(config, fakeUpstash({ fail: true }).send)
    await expect(store.get(id(1))).rejects.toThrow(/HGET failed: ERR boom/)
  })
})

describe('the routes with the environment plugged in', () => {
  const post = (body: unknown) => new Request('https://x.test/api/track', { method: 'POST', body: JSON.stringify(body) })
  const KEY = 'a-long-secret-key-for-tests'
  const get = (auth?: string) => new Request('https://x.test/api/stats', { headers: auth ? { authorization: auth } : {} })

  it('work from the report to the totals through a Redis database', async () => {
    const up = fakeUpstash()
    const env = { ...ENV, STATS_KEY: KEY }
    expect((await trackRoute(post(picture(1, { core: [1, 2], deeper: [1] })), env, 14, NOW, up.send)).status).toBe(200)
    expect((await trackRoute(post(picture(2, { core: [1] })), env, 14, NOW, up.send)).status).toBe(200)
    const titles = Array.from({ length: 14 }, (_, i) => `Day ${i + 1}`)
    const res = await statsRoute(get(`Bearer ${KEY}`), env, titles, NOW, up.send)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ players: 2, wentDeeper: 1, finishedAll: 0, titles })
    expect(body.days[0]).toEqual({ day: 1, core: 2, deeper: 1 })
  })

  it('say plainly that there is no database yet (503), instead of failing confusingly', async () => {
    const res = await trackRoute(post(picture(1)), {}, 14, NOW)
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe(NO_DATABASE)
    const stats = await statsRoute(get(`Bearer ${KEY}`), { STATS_KEY: KEY }, [], NOW)
    expect(stats.status).toBe(503)
    expect((await stats.json()).error).toBe(NO_DATABASE)
  })

  it('check the key before touching the database', async () => {
    const up = fakeUpstash()
    expect((await statsRoute(get('Bearer wrong-key-wrong-key-wrong'), { ...ENV, STATS_KEY: KEY }, [], NOW, up.send)).status).toBe(401)
    expect((await statsRoute(get(`Bearer ${KEY}`), ENV, [], NOW, up.send)).status).toBe(503) // no STATS_KEY set
    expect(up.calls).toHaveLength(0)
  })

  it('answer 500, without details, when the database fails', async () => {
    const env = { ...ENV, STATS_KEY: KEY }
    const track = await trackRoute(post(picture(1)), env, 14, NOW, fakeUpstash({ fail: true }).send)
    expect(track.status).toBe(500)
    expect(await track.json()).toEqual({ error: 'storage error' })
    const stats = await statsRoute(get(`Bearer ${KEY}`), env, [], NOW, fakeUpstash({ fail: true }).send)
    expect(stats.status).toBe(500)
    expect(JSON.stringify(await stats.json())).not.toContain('boom')
  })

  it('treat a store that says it is missing as 503, and any other failure as 500', async () => {
    const missing: PlayerStore = { get: async () => { throw new StorageMissing('no db') }, set: async () => {}, all: async () => { throw new StorageMissing('no db') } }
    expect((await handleTrack(post(picture(1)), missing, NOW, 14)).status).toBe(503)
    expect((await handleStats(get(`Bearer ${KEY}`), missing, KEY, NOW, 14)).status).toBe(503)
  })
})
