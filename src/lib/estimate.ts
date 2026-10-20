import type { Card } from '../types'

/** Rough seconds a typical member spends on each kind of card. */
const SECONDS: Record<Card['type'], number> = { read: 25, choice: 30, findMove: 60, spot: 30, puzzleSet: 0 }
const SECONDS_PER_PUZZLE = 75

export function estimateMinutes(cards: Card[]): number {
  let s = 0
  for (const c of cards) s += c.type === 'puzzleSet' ? c.puzzles.length * SECONDS_PER_PUZZLE : SECONDS[c.type]
  return Math.round(s / 60)
}
