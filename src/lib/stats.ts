/**
 * Counting players, without names. Each phone makes a random ID, and reports a small progress picture: the day the member
 * tapped Start, which core lessons are finished and which Go deeper sections are finished. The server keeps one record per
 * ID and the latest picture replaces the last, so a repeated or lost message can never double-count. Nothing here knows a
 * name, a phone number or an address.
 *
 * This file is pure (no browser, no network), so the phone and the server share it and the tests can cover it.
 */

import { DAY_MS, kampalaMidnight } from './time'

/** What a phone reports. */
export interface Snapshot {
  /** Random, 32 hex characters, made on the phone. */
  id: string
  /** When the member tapped Start (ms since 1970), or null if they have not (or reset). */
  startedAt: number | null
  /** Day numbers whose core lesson is finished. */
  core: number[]
  /** Day numbers whose Go deeper section is finished. */
  deeper: number[]
  /** The phone's clock when the picture was made, so an older picture never replaces a newer one. */
  at: number
}

/** What the server keeps for each ID. */
export interface PlayerRecord extends Snapshot {
  /** When the server first heard from this ID. */
  first: number
  /** When the server last heard from this ID. */
  seen: number
}

const ID_PATTERN = /^[0-9a-f]{32}$/

export function validId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id)
}

/** A fresh random ID. Uses the browser's secure random numbers where there are any. */
export function newId(random: () => number = Math.random): string {
  const bytes = new Uint8Array(16)
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function dayList(raw: unknown, totalDays: number): number[] | null {
  if (!Array.isArray(raw) || raw.length > totalDays) return null
  const days = new Set<number>()
  for (const d of raw) {
    if (!Number.isInteger(d) || d < 1 || d > totalDays) return null
    days.add(d)
  }
  return [...days].sort((a, b) => a - b)
}

/** Checks what a phone sent. Anything that does not fit is rejected (null), so odd input never reaches the store. */
export function parseSnapshot(raw: unknown, now: number, totalDays: number): Snapshot | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!validId(r.id)) return null
  const core = dayList(r.core, totalDays)
  const deeper = dayList(r.deeper, totalDays)
  if (!core || !deeper) return null
  let startedAt: number | null = null
  if (r.startedAt !== null && r.startedAt !== undefined) {
    if (typeof r.startedAt !== 'number' || !Number.isFinite(r.startedAt)) return null
    // 2026 to 2100: a wrong phone clock cannot put someone in the distant past or future
    if (r.startedAt < Date.UTC(2026, 0, 1) || r.startedAt > Date.UTC(2100, 0, 1)) return null
    startedAt = Math.min(r.startedAt, now)
  }
  if (typeof r.at !== 'number' || !Number.isFinite(r.at)) return null
  return { id: r.id, startedAt, core, deeper, at: Math.min(r.at, now) }
}

/** The shape of the progress the phone keeps (see store.ts), as far as counting needs it. */
export interface ProgressLike {
  startedAt?: number
  days: Record<string, { coreDone?: number; deeperDone?: number }>
}

/** Builds the picture a phone reports from its own progress. */
export function buildSnapshot(id: string, progress: ProgressLike, totalDays: number, now: number): Snapshot {
  const core: number[] = []
  const deeper: number[] = []
  for (let d = 1; d <= totalDays; d++) {
    const p = progress.days[String(d)]
    if (p?.coreDone) core.push(d)
    if (p?.deeperDone) deeper.push(d)
  }
  const startedAt = typeof progress.startedAt === 'number' && Number.isFinite(progress.startedAt) ? progress.startedAt : null
  return { id, startedAt, core, deeper, at: now }
}

/** The record to keep, or null if this picture is older than the one already stored. */
export function mergeRecord(old: PlayerRecord | null, snap: Snapshot, now: number): PlayerRecord | null {
  if (old && snap.at < old.at) return null
  return { ...snap, first: old ? old.first : now, seen: now }
}

/** A short text that changes exactly when the picture changes, so a phone only reports when there is news. */
export function snapshotKey(s: Pick<Snapshot, 'startedAt' | 'core' | 'deeper'>): string {
  return JSON.stringify([s.startedAt, s.core, s.deeper])
}

export interface Summary {
  generatedAt: number
  /** Tapped Start. */
  players: number
  /** Of those, heard from in the last three days. */
  active3d: number
  /** Finished the core lesson of every day. */
  finishedAll: number
  /** Finished at least one Go deeper section. */
  wentDeeper: number
  /** For each day: how many finished the core lesson, and how many finished Go deeper. */
  days: { day: number; core: number; deeper: number }[]
  /** The last core day each player finished (0 = none yet), to show where people stop. */
  where: { lastDay: number; people: number }[]
  /** How many tapped Start on each Kampala day (midnight, ms), oldest first. */
  joined: { date: number; people: number }[]
}

export const ACTIVE_WINDOW_MS = 3 * DAY_MS

/** Totals for the private stats page. Only people who tapped Start are counted as players. */
export function summarise(records: PlayerRecord[], now: number, totalDays: number): Summary {
  const players = records.filter((r) => r.startedAt !== null)
  const days = Array.from({ length: totalDays }, (_, i) => ({ day: i + 1, core: 0, deeper: 0 }))
  const where = new Map<number, number>()
  const joined = new Map<number, number>()
  let finishedAll = 0
  let wentDeeper = 0
  let active3d = 0
  for (const p of players) {
    for (const d of p.core) days[d - 1].core++
    for (const d of p.deeper) days[d - 1].deeper++
    if (p.core.length === totalDays) finishedAll++
    if (p.deeper.length > 0) wentDeeper++
    if (now - p.seen <= ACTIVE_WINDOW_MS) active3d++
    const last = p.core.length ? Math.max(...p.core) : 0
    where.set(last, (where.get(last) ?? 0) + 1)
    const day = kampalaMidnight(p.startedAt as number)
    joined.set(day, (joined.get(day) ?? 0) + 1)
  }
  return {
    generatedAt: now,
    players: players.length,
    active3d,
    finishedAll,
    wentDeeper,
    days,
    where: [...where.entries()].sort((a, b) => a[0] - b[0]).map(([lastDay, people]) => ({ lastDay, people })),
    joined: [...joined.entries()].sort((a, b) => a[0] - b[0]).map(([date, people]) => ({ date, people })),
  }
}
