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

export interface OpenRules {
  nowMs: number
  startMs: number
  /** Config switch: every day is open whatever the date. */
  unlockAll?: boolean
  /** The ?preview=1 link: every day is open for whoever opened that link. */
  preview?: boolean
}

/** Is this day open? The one place that answers, so the home screen and the lesson screen never disagree. */
export function dayOpen(day: number, r: OpenRules): boolean {
  return !!r.unlockAll || !!r.preview || isOpen(r.nowMs, r.startMs, day)
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
