import type { Square } from '../types'

export const FILES = 'abcdefgh'

/** Square name from file index (0 = a) and rank index (0 = rank 1). */
export function sqName(file: number, rank: number): Square {
  return FILES[file] + String(rank + 1)
}

/** 64 entries, a8 first then across the 8th rank down to h1. Each is a FEN piece letter or null. */
export function placement(fen: string): (string | null)[] {
  const out: (string | null)[] = []
  for (const row of fen.split(' ')[0].split('/')) {
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') for (let i = 0; i < +ch; i++) out.push(null)
      else out.push(ch)
    }
  }
  return out
}

export function turnOf(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}

/** Board index (0..63, a8 = 0) for a square name. */
export function indexOf(sq: Square): number {
  const f = FILES.indexOf(sq[0])
  const r = Number(sq[1]) - 1
  return (7 - r) * 8 + f
}
