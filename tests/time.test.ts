import { describe, expect, it } from 'vitest'
import { challengeStatus, currentDay, dayOpen, formatDate, formatTime, getNow, isOpen, isPreview, kampalaMidnight, parseStart, personalStart, unlockAt } from '../src/lib/time'

const START = parseStart('2026-10-26T00:00:00+03:00') // Monday, midnight in Kampala

describe('Kampala unlock times', () => {
  it('opens Day 1 at exactly midnight Kampala time, not UTC', () => {
    // 23:59 Kampala on Sunday 25 Oct is 20:59 UTC
    expect(isOpen(Date.parse('2026-10-25T23:59:59+03:00'), START, 1)).toBe(false)
    expect(isOpen(Date.parse('2026-10-26T00:00:00+03:00'), START, 1)).toBe(true)
    // 21:00 UTC on the 25th is already 00:00 on the 26th in Kampala
    expect(isOpen(Date.parse('2026-10-25T21:00:00Z'), START, 1)).toBe(true)
  })

  it('opens one day per 24 hours', () => {
    expect(unlockAt(START, 3)).toBe(Date.parse('2026-10-28T00:00:00+03:00'))
    expect(isOpen(Date.parse('2026-10-27T23:59:59+03:00'), START, 3)).toBe(false)
    expect(isOpen(Date.parse('2026-10-28T00:00:00+03:00'), START, 3)).toBe(true)
  })

  it('keeps past days open', () => {
    const later = Date.parse('2026-11-20T12:00:00+03:00')
    for (let d = 1; d <= 14; d++) expect(isOpen(later, START, d)).toBe(true)
  })

  it('reports which day it is', () => {
    expect(currentDay(Date.parse('2026-10-25T12:00:00+03:00'), START, 14)).toBe(0)
    expect(currentDay(Date.parse('2026-10-26T09:00:00+03:00'), START, 14)).toBe(1)
    expect(currentDay(Date.parse('2026-11-08T23:59:00+03:00'), START, 14)).toBe(14)
    expect(currentDay(Date.parse('2026-11-09T00:00:00+03:00'), START, 14)).toBe(15)
  })
})

describe('which days are open', () => {
  const before = Date.parse('2026-10-20T12:00:00+03:00') // six days before the start
  const tapped = Date.parse('2026-10-26T10:00:00+03:00') // a member taps Start on the first day
  const during = Date.parse('2026-10-27T12:00:00+03:00') // day 2

  it('keeps every day locked for someone who has not tapped Start, even after the shared start', () => {
    expect(dayOpen(1, { nowMs: before, startMs: START })).toBe(false)
    expect(dayOpen(1, { nowMs: during, startMs: START })).toBe(false)
    expect(dayOpen(1, { nowMs: during, startMs: START, startedAt: undefined })).toBe(false)
  })

  it('opens the days one at a time from the day the member tapped Start', () => {
    expect(dayOpen(1, { nowMs: tapped, startMs: START, startedAt: tapped })).toBe(true)
    expect(dayOpen(2, { nowMs: tapped, startMs: START, startedAt: tapped })).toBe(false)
    expect(dayOpen(2, { nowMs: during, startMs: START, startedAt: tapped })).toBe(true)
    expect(dayOpen(3, { nowMs: during, startMs: START, startedAt: tapped })).toBe(false)
  })

  it('opens every day when unlockAll is on, even before the start date or Start', () => {
    for (let d = 1; d <= 14; d++) expect(dayOpen(d, { nowMs: before, startMs: START, unlockAll: true })).toBe(true)
  })

  it('opens every day for a ?preview=1 link', () => {
    expect(dayOpen(9, { nowMs: before, startMs: START, preview: true })).toBe(true)
  })

  it('goes back to locking when unlockAll is false or missing', () => {
    expect(dayOpen(3, { nowMs: during, startMs: START, startedAt: tapped, unlockAll: false })).toBe(false)
    expect(dayOpen(3, { nowMs: during, startMs: START, startedAt: tapped, unlockAll: undefined })).toBe(false)
  })
})

describe('each member starts when they tap Start, but never before the shared start', () => {
  const COHORT = parseStart('2026-10-22T00:00:00+03:00') // the real shared start: Thursday 22 October
  const at = (iso: string) => Date.parse(iso)

  it('finds midnight in Kampala, not in UTC', () => {
    expect(kampalaMidnight(at('2026-10-22T10:00:00+03:00'))).toBe(COHORT)
    expect(kampalaMidnight(at('2026-10-22T23:59:59+03:00'))).toBe(COHORT)
    expect(kampalaMidnight(at('2026-10-23T00:00:00+03:00'))).toBe(COHORT + 24 * 3_600_000)
    expect(kampalaMidnight(at('2026-10-22T21:00:00Z'))).toBe(COHORT + 24 * 3_600_000) // 00:00 on the 23rd in Kampala
  })

  it('has no start until the member taps Start', () => {
    expect(personalStart(COHORT, undefined, at('2026-10-25T12:00:00+03:00'))).toBeNull()
    expect(personalStart(COHORT, null, at('2026-10-25T12:00:00+03:00'))).toBeNull()
    expect(personalStart(COHORT, Number.NaN, at('2026-10-25T12:00:00+03:00'))).toBeNull()
  })

  it('puts a first-day tap in step with the group, whatever the hour', () => {
    expect(personalStart(COHORT, at('2026-10-22T00:01:00+03:00'), at('2026-10-22T00:01:00+03:00'))).toBe(COHORT)
    expect(personalStart(COHORT, at('2026-10-22T23:59:00+03:00'), at('2026-10-23T09:00:00+03:00'))).toBe(COHORT)
  })

  it('gives a late starter their own 14 days from the day they tapped', () => {
    const tap = at('2026-10-25T14:30:00+03:00')
    const start = personalStart(COHORT, tap, tap)!
    expect(start).toBe(at('2026-10-25T00:00:00+03:00'))
    expect(isOpen(tap, start, 1)).toBe(true)
    expect(isOpen(at('2026-10-25T23:59:59+03:00'), start, 2)).toBe(false)
    expect(isOpen(at('2026-10-26T00:00:00+03:00'), start, 2)).toBe(true) // the next midnight, Kampala time
    expect(unlockAt(start, 14)).toBe(at('2026-11-07T00:00:00+03:00'))
  })

  it('counts a tap before the shared start as the shared start', () => {
    expect(personalStart(COHORT, at('2026-10-20T09:00:00+03:00'), at('2026-10-23T09:00:00+03:00'))).toBe(COHORT)
  })

  it('never locks a member out until a date that has not come (a wrong clock when they tapped)', () => {
    const now = at('2026-10-25T09:00:00+03:00')
    expect(personalStart(COHORT, at('2027-03-01T09:00:00+03:00'), now)).toBe(at('2026-10-25T00:00:00+03:00'))
  })

  it('reports where a member is in the challenge', () => {
    expect(challengeStatus(at('2026-10-21T12:00:00+03:00'), COHORT, undefined, 14)).toEqual({ phase: 'before', start: null, day: 0 })
    // a tap that was somehow recorded early still waits for the shared start
    expect(challengeStatus(at('2026-10-21T12:00:00+03:00'), COHORT, at('2026-10-21T11:00:00+03:00'), 14).phase).toBe('before')
    expect(challengeStatus(at('2026-10-24T12:00:00+03:00'), COHORT, undefined, 14)).toEqual({ phase: 'ready', start: null, day: 0 })
    const running = challengeStatus(at('2026-10-24T12:00:00+03:00'), COHORT, at('2026-10-23T08:00:00+03:00'), 14)
    expect(running).toEqual({ phase: 'running', start: at('2026-10-23T00:00:00+03:00'), day: 2 })
    expect(challengeStatus(at('2026-11-05T23:59:00+03:00'), COHORT, at('2026-10-23T08:00:00+03:00'), 14).day).toBe(14)
    expect(challengeStatus(at('2026-11-06T00:00:00+03:00'), COHORT, at('2026-10-23T08:00:00+03:00'), 14)).toMatchObject({ phase: 'over', day: 15 })
  })

  it('has members who tapped on different days on different days', () => {
    const now = at('2026-10-27T09:00:00+03:00')
    const early = challengeStatus(now, COHORT, at('2026-10-22T08:00:00+03:00'), 14)
    const late = challengeStatus(now, COHORT, at('2026-10-26T08:00:00+03:00'), 14)
    expect([early.day, late.day]).toEqual([6, 2])
  })
})

describe('formatting in Kampala time', () => {
  it('formats the date without Intl time zone support', () => {
    expect(formatDate(START)).toBe('Mon 26 Oct')
    // 22:30 UTC on the 26th is already Tuesday in Kampala
    expect(formatDate(Date.parse('2026-10-26T22:30:00Z'))).toBe('Tue 27 Oct')
  })
  it('formats the time', () => {
    expect(formatTime(Date.parse('2026-10-26T11:05:00Z'))).toBe('14:05')
  })
})

describe('preview helpers', () => {
  it('lets ?now= override the clock', () => {
    expect(getNow('?now=2026-10-27T09:00:00%2B03:00')).toBe(Date.parse('2026-10-27T09:00:00+03:00'))
  })
  it('ignores a bad ?now=', () => {
    const before = Date.now()
    expect(getNow('?now=banana')).toBeGreaterThanOrEqual(before)
  })
  it('reads ?preview=1', () => {
    expect(isPreview('?preview=1')).toBe(true)
    expect(isPreview('')).toBe(false)
  })
  it('rejects a bad start date', () => {
    expect(() => parseStart('soon')).toThrow()
  })
})
