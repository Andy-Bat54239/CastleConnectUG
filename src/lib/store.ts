/**
 * Progress lives on the member's own phone. Some in-app browsers block localStorage, or throw
 * when it is touched, so every access is wrapped and we fall back to memory for the session.
 */

export interface CardResult {
  /** Card finished: answered correctly, or the answer was shown after misses. */
  done: boolean
  /** Got it right on the first try (this is what the quiz score counts). */
  first: boolean
  tries: number
  shown?: boolean
}

export interface DayProgress {
  /** Where the member got to in each part. */
  pos: { core: number; deeper: number }
  res: Record<string, CardResult>
  coreDone?: number
  deeperDone?: number
  /** Puzzle, play, share ticks on Today's Grind. */
  habits: boolean[]
  note: string
}

export interface Progress {
  v: 1
  days: Record<string, DayProgress>
  /** When the member tapped Start (ms since 1970). Their own Day 1 is counted from this day. */
  startedAt?: number
}

const KEY = 'bg:v1'
let memory: Progress | null = null
let persistent = false

function blank(): Progress {
  return { v: 1, days: {} }
}

function probe(): boolean {
  try {
    const k = 'bg:probe'
    localStorage.setItem(k, '1')
    const ok = localStorage.getItem(k) === '1'
    localStorage.removeItem(k)
    return ok
  } catch {
    return false
  }
}

export function load(): Progress {
  if (memory) return memory
  persistent = probe()
  let p = blank()
  if (persistent) {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.v === 1 && typeof parsed.days === 'object') p = parsed
      }
    } catch {
      /* corrupt data: start fresh */
    }
  }
  memory = p
  return p
}

let listener: (() => void) | null = null

/** Called after every change to the progress (the player counter listens, and decides for itself whether there is news). */
export function onChange(fn: () => void): void {
  listener = fn
}

function persist(): void {
  listener?.()
  if (!persistent || !memory) return
  try {
    localStorage.setItem(KEY, JSON.stringify(memory))
  } catch {
    persistent = false
  }
}

/** False when this browser will not remember progress (so we can say so). */
export function canSave(): boolean {
  load()
  return persistent
}

export function getDay(day: number): DayProgress {
  const p = load()
  const k = String(day)
  if (!p.days[k]) p.days[k] = { pos: { core: 0, deeper: 0 }, res: {}, habits: [false, false, false], note: '' }
  return p.days[k]
}

export function update(day: number, fn: (d: DayProgress) => void): void {
  fn(getDay(day))
  persist()
}

export function isCoreDone(day: number): boolean {
  return !!load().days[String(day)]?.coreDone
}

export function isDeeperDone(day: number): boolean {
  return !!load().days[String(day)]?.deeperDone
}

export function doneCount(): number {
  return Object.values(load().days).filter((d) => d.coreDone).length
}

/** When the member tapped Start on this phone, or undefined if they have not. */
export function getStartedAt(): number | undefined {
  const s = load().startedAt
  return typeof s === 'number' && Number.isFinite(s) ? s : undefined
}

/** Record the moment the member tapped Start. The first tap wins, so reopening the link never moves it. */
export function markStarted(ms: number): void {
  if (getStartedAt() !== undefined) return
  load().startedAt = ms
  persist()
}

/** "I started earlier": set the start by hand (for a member whose browser forgot, or who began on another phone). */
export function setStartedAt(ms: number): void {
  load().startedAt = ms
  persist()
}

export function resetAll(): void {
  memory = blank()
  persist()
}

/** For tests: forget the in-memory copy so the next call re-reads storage. */
export function _forget(): void {
  memory = null
}

/** Quiz score for the Core part of a day: cards answered right first time / scored cards. */
export function score(day: number, keys: string[]): { right: number; total: number } {
  const d = getDay(day)
  let right = 0
  for (const k of keys) if (d.res[k]?.first) right++
  return { right, total: keys.length }
}
