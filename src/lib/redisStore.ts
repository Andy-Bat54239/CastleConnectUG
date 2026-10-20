import type { PlayerRecord } from './stats'
import type { PlayerStore } from './statsHandlers'

/**
 * The player records, kept in a Redis database that Vercel's Upstash integration adds to the project. It is reached over
 * HTTPS with plain fetch (Upstash's REST interface), so there is nothing to install. All records live in one hash:
 * the field is the anonymous ID and the value is the record as JSON.
 */

type Env = Record<string, string | undefined>

export interface RedisConfig {
  url: string
  token: string
}

const HASH = 'bridgegrind:players'

/**
 * Finds the REST address and token in the environment. The integration may name them UPSTASH_REDIS_REST_URL / _TOKEN or
 * the older KV_REST_API_URL / _TOKEN, and Vercel lets you add a prefix when you connect a store (for example
 * STORAGE_KV_REST_API_URL), so every spelling is accepted. The read-only token is never used.
 */
export function redisConfig(env: Env): RedisConfig | null {
  const found: { url: string; token: string; prefixLength: number }[] = []
  for (const [name, value] of Object.entries(env)) {
    const m = /^(.*?)(UPSTASH_REDIS_REST|KV_REST_API)_URL$/.exec(name)
    if (!m || !value || !/^https?:\/\//i.test(value)) continue
    const token = env[`${m[1]}${m[2]}_TOKEN`]
    if (token) found.push({ url: value, token, prefixLength: m[1].length })
  }
  // an unprefixed pair wins over a prefixed one
  found.sort((a, b) => a.prefixLength - b.prefixLength)
  return found.length ? { url: found[0].url.replace(/\/+$/, ''), token: found[0].token } : null
}

export function redisPlayerStore(config: RedisConfig, send: typeof fetch = fetch): PlayerStore {
  async function command(args: string[]): Promise<unknown> {
    const res = await send(config.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    })
    const data = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string }
    if (!res.ok || data.error) throw new Error(`Redis ${args[0]} failed: ${data.error ?? res.status}`)
    return data.result
  }

  const parse = (text: unknown): PlayerRecord | null => {
    if (typeof text !== 'string') return null
    try {
      return JSON.parse(text) as PlayerRecord
    } catch {
      return null
    }
  }

  return {
    async get(id) {
      return parse(await command(['HGET', HASH, id]))
    },
    async set(id, record) {
      await command(['HSET', HASH, id, JSON.stringify(record)])
    },
    async all() {
      const flat = (await command(['HGETALL', HASH])) as unknown
      const out: PlayerRecord[] = []
      // HGETALL answers with [field, value, field, value, ...]
      if (Array.isArray(flat)) for (let i = 1; i < flat.length; i += 2) {
        const r = parse(flat[i])
        if (r) out.push(r)
      }
      return out
    },
  }
}
