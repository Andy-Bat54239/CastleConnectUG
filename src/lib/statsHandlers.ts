import { mergeRecord, parseSnapshot, summarise, type PlayerRecord } from './stats'

/**
 * The two server routes, written against plain Request/Response and a tiny store interface, so the same code runs in the
 * Vercel functions (with a Redis database behind the store) and in the tests and local checks (with a map behind it).
 */

export interface PlayerStore {
  get(id: string): Promise<PlayerRecord | null>
  set(id: string, record: PlayerRecord): Promise<void>
  all(): Promise<PlayerRecord[]>
}

/** Thrown by a store that has no database behind it yet, so the routes can say so (503) instead of failing blindly (500). */
export class StorageMissing extends Error {}

function storageProblem(e: unknown): Response {
  if (e instanceof StorageMissing) return json({ error: e.message }, 503)
  console.error('counter storage error', e)
  return json({ error: 'storage error' }, 500)
}

const MAX_BODY = 2000
const MIN_KEY_LENGTH = 16

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    // Counts must never be served from a cache.
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** POST /api/track: a phone reports its progress picture. */
export async function handleTrack(req: Request, store: PlayerStore, now: number, totalDays: number): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const text = await req.text()
  if (text.length > MAX_BODY) return json({ error: 'too big' }, 413)
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return json({ error: 'not JSON' }, 400)
  }
  const snap = parseSnapshot(raw, now, totalDays)
  if (!snap) return json({ error: 'not a progress picture' }, 400)
  try {
    const merged = mergeRecord(await store.get(snap.id), snap, now)
    if (merged) await store.set(snap.id, merged)
    return json({ ok: true, stored: !!merged })
  } catch (e) {
    return storageProblem(e)
  }
}

/** Compares two strings in a way that takes the same time wherever they differ. */
function sameSecret(a: string, b: string): boolean {
  let diff = a.length === b.length ? 0 : 1
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/** GET /api/stats: the totals, for whoever holds the secret key (sent as "Authorization: Bearer <key>"). */
export async function handleStats(req: Request, store: PlayerStore, secret: string | undefined, now: number, totalDays: number, titles: string[] = []): Promise<Response> {
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405)
  // With no key set, nobody can read the numbers. The site never falls back to an open page.
  if (!secret || secret.length < MIN_KEY_LENGTH) return json({ error: 'The STATS_KEY setting is missing or too short (use at least 16 characters).' }, 503)
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!sameSecret(given, secret)) return json({ error: 'wrong key' }, 401)
  try {
    return json({ ...summarise(await store.all(), now, totalDays), titles })
  } catch (e) {
    return storageProblem(e)
  }
}
