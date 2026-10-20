import * as store from './store'
import { buildSnapshot, newId, snapshotKey, validId } from './stats'
import { HOUR_MS } from './time'

/**
 * Tells the server, anonymously, how far this phone has got (see stats.ts). It runs quietly: if there is no connection or
 * the server says no, nothing is shown, and the next report carries the same news, because every report is the whole picture.
 */

const ID_KEY = 'bg:id'
const SENT_KEY = 'bg:sent'
/** Even with no news, report once every few hours so the server knows this phone is still playing. */
export const REFRESH_MS = 6 * HOUR_MS
const WAIT_MS = 1500

/** Test links (?preview=1, ?now=...) and the dev server are never counted, and neither is a browser that cannot keep an ID. */
export function shouldReport(search: string, dev: boolean, canSave: boolean): boolean {
  if (dev || !canSave) return false
  const q = new URLSearchParams(search)
  return q.get('preview') !== '1' && !q.get('now')
}

/** This phone's random ID, made on first use and kept next to the progress. Null if the browser will not keep it. */
function readId(): string | null {
  try {
    const have = localStorage.getItem(ID_KEY)
    if (validId(have)) return have
    const id = newId()
    localStorage.setItem(ID_KEY, id)
    return localStorage.getItem(ID_KEY) === id ? id : null
  } catch {
    return null
  }
}

interface Sent {
  k: string
  t: number
}

function readSent(): Sent | null {
  try {
    const raw = localStorage.getItem(SENT_KEY)
    const v = raw ? JSON.parse(raw) : null
    return v && typeof v.k === 'string' && typeof v.t === 'number' ? v : null
  } catch {
    return null
  }
}

function writeSent(s: Sent): void {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(s))
  } catch {
    /* the next report just sends again */
  }
}

let inFlight = false

/** Sends the picture if there is news (or it has been a while). Returns what happened, for the tests. */
export async function report(totalDays: number, now: number = Date.now(), send: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined): Promise<'sent' | 'quiet' | 'failed' | 'off'> {
  if (!send || inFlight) return 'off'
  const id = readId()
  if (!id) return 'off'
  const snap = buildSnapshot(id, store.load(), totalDays, now)
  const key = snapshotKey(snap)
  const sent = readSent()
  // Someone who has not tapped Start is not a player, and is not reported (unless they reset after being counted).
  if (snap.startedAt === null && !sent) return 'quiet'
  if (sent && sent.k === key && now - sent.t < REFRESH_MS) return 'quiet'
  inFlight = true
  try {
    const res = await send('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(snap), keepalive: true })
    if (!res.ok) return 'failed'
    writeSent({ k: key, t: now })
    return 'sent'
  } catch {
    return 'failed'
  } finally {
    inFlight = false
  }
}

let timer: ReturnType<typeof setTimeout> | null = null

function later(totalDays: number, wait: number): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void report(totalDays), wait)
}

/** Starts counting for this page: reports now, and again shortly after any change to the progress. */
export function startTracking(totalDays: number, search: string, dev: boolean): void {
  if (!shouldReport(search, dev, store.canSave())) return
  store.onChange(() => later(totalDays, WAIT_MS))
  later(totalDays, 0)
}
