import { describe, expect, it } from 'vitest'
import { currentDay, formatDate, formatTime, getNow, isOpen, isPreview, parseStart, unlockAt } from '../src/lib/time'

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
