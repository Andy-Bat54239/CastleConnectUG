/**
 * Kampala time (Africa/Kampala, UTC+3, no daylight saving).
 * We use the fixed offset directly instead of Intl time zones: it is exact for Kampala and
 * works in every in-app browser, including ones with a stripped-down Intl.
 */
export const HOUR_MS = 3_600_000
export const DAY_MS = 24 * HOUR_MS
const OFFSET_MS = 3 * HOUR_MS

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function parseStart(iso: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error(`Bad startDate in content/config.json: "${iso}"`)
  return ms
}

/** The moment a given day (1-based) opens: midnight Kampala time on start date + (day - 1). */
export function unlockAt(startMs: number, day: number): number {
  return startMs + (day - 1) * DAY_MS
}

export function isOpen(nowMs: number, startMs: number, day: number): boolean {
  return nowMs >= unlockAt(startMs, day)
}

/** Midnight, Kampala time, at the start of the Kampala day that contains `ms`. */
export function kampalaMidnight(ms: number): number {
  return Math.floor((ms + OFFSET_MS) / DAY_MS) * DAY_MS - OFFSET_MS
}

/**
 * When this member's Day 1 begins, or null if they have not tapped Start yet.
 *
 * `cohortMs` is the shared start of the challenge (midnight Kampala). Day 1 begins at midnight, Kampala time, on the day the
 * member tapped Start, but never before the shared start, so everyone who starts on the first day is on the same day as the
 * group, and anyone who starts later gets their own 14 days. A tap time that is in the future (a wrong phone clock, or a
 * preview link) counts as now, so a member can never be locked out until a date that has not come.
 */
export function personalStart(cohortMs: number, startedAt: number | undefined | null, nowMs: number): number | null {
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null
  return Math.max(cohortMs, kampalaMidnight(Math.min(startedAt, nowMs)))
}

export interface OpenRules {
  nowMs: number
  /** The shared start of the challenge: midnight Kampala time at the start of Day 1 for the whole group. */
  startMs: number
  /** When the member tapped Start (ms since 1970), if they have. */
  startedAt?: number | null
  /** Config switch: every day is open whatever the date. */
  unlockAll?: boolean
  /** The ?preview=1 link: every day is open for whoever opened that link. */
  preview?: boolean
}

/** Is this day open? The one place that answers, so the home screen and the lesson screen never disagree. */
export function dayOpen(day: number, r: OpenRules): boolean {
  if (r.unlockAll || r.preview) return true
  const start = personalStart(r.startMs, r.startedAt, r.nowMs)
  return start !== null && isOpen(r.nowMs, start, day)
}

export type Phase =
  /** The shared start has not come yet. */
  | 'before'
  /** The challenge has begun but this member has not tapped Start. */
  | 'ready'
  /** The member's 14 days are running: `day` is today's day number. */
  | 'running'
  /** The member's 14 days are over. */
  | 'over'

export interface Status {
  phase: Phase
  /** The member's own Day 1 (ms), once they have started. */
  start: number | null
  /** 0 until the member starts, 1..totalDays while running, totalDays + 1 when over. */
  day: number
}

/** Where is this member in the challenge? Used by the home and lesson screens, so they always agree. */
export function challengeStatus(nowMs: number, cohortMs: number, startedAt: number | undefined | null, totalDays: number): Status {
  if (nowMs < cohortMs) return { phase: 'before', start: null, day: 0 }
  const start = personalStart(cohortMs, startedAt, nowMs)
  if (start === null) return { phase: 'ready', start: null, day: 0 }
  const day = currentDay(nowMs, start, totalDays)
  return { phase: day > totalDays ? 'over' : 'running', start, day }
}

/** 0 before the challenge starts, 1..totalDays during it, totalDays + 1 once it is over. */
export function currentDay(nowMs: number, startMs: number, totalDays: number): number {
  if (nowMs < startMs) return 0
  const d = Math.floor((nowMs - startMs) / DAY_MS) + 1
  return Math.min(d, totalDays + 1)
}

/** "Mon 26 Oct" in Kampala time. */
export function formatDate(ms: number): string {
  const d = new Date(ms + OFFSET_MS)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** "14:05" in Kampala time. */
export function formatTime(ms: number): string {
  const d = new Date(ms + OFFSET_MS)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/**
 * "Now", in ms. A `?now=2026-10-27T09:00:00+03:00` query lets Joel preview any day without
 * waiting for it; `?preview=1` opens everything. Changing your own clock only cheats yourself,
 * so none of this needs to be secret.
 */
export function getNow(search: string = typeof location !== 'undefined' ? location.search : ''): number {
  const q = new URLSearchParams(search)
  const forced = q.get('now')
  if (forced) {
    const ms = Date.parse(forced)
    if (!Number.isNaN(ms)) return ms
  }
  return Date.now()
}

export function isPreview(search: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  return new URLSearchParams(search).get('preview') === '1'
}
