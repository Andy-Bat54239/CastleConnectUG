import { Chess } from 'chess.js'
import type { Square } from '../types'
import { FILES, sqName } from './fen'

export const ALL_SQUARES: Square[] = []
for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) ALL_SQUARES.push(sqName(f, r))

export const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

/** SAN without check/mate/annotation marks, for comparing a move against stored answers. */
export function stripSan(s: string): string {
  return s.replace(/[+#!?]/g, '')
}

export function isSquare(s: string): boolean {
  return /^[a-h][1-8]$/.test(s)
}

export function isFileRank(s: string): boolean {
  return s.length === 2 && FILES.includes(s[0]) && s[1] >= '1' && s[1] <= '8'
}

/** Squares the piece on `sq` attacks (including squares holding its own pieces, i.e. what it defends). */
export function attacksOf(chess: Chess, sq: Square): Square[] {
  const piece = chess.get(sq as never)
  if (!piece) return []
  return ALL_SQUARES.filter((t) => chess.attackers(t as never, piece.color).includes(sq as never))
}

/** Friendly pieces defending the piece on `sq`. */
export function defendersOf(chess: Chess, sq: Square): Square[] {
  const piece = chess.get(sq as never)
  if (!piece) return []
  return chess.attackers(sq as never, piece.color) as Square[]
}

/** Enemy pieces attacking the piece on `sq`. */
export function attackersOf(chess: Chess, sq: Square): Square[] {
  const piece = chess.get(sq as never)
  if (!piece) return []
  return chess.attackers(sq as never, piece.color === 'w' ? 'b' : 'w') as Square[]
}

/** Can the side to move give checkmate in one? */
export function hasMateInOne(chess: Chess): boolean {
  for (const m of chess.moves()) {
    chess.move(m)
    const mate = chess.isCheckmate()
    chess.undo()
    if (mate) return true
  }
  return false
}

/** Legal first moves (SAN) of the side to move that give checkmate. */
export function matingMoves(chess: Chess): string[] {
  const out: string[] = []
  for (const m of chess.moves()) {
    chess.move(m)
    if (chess.isCheckmate()) out.push(m)
    chess.undo()
  }
  return out
}

/** Legal moves (SAN) after which the opponent has no mate in one. */
export function mateAvoidingMoves(chess: Chess): string[] {
  const out: string[] = []
  for (const m of chess.moves()) {
    chess.move(m)
    if (!hasMateInOne(chess)) out.push(m)
    chess.undo()
  }
  return out
}

/** Pieces of `color` that have no friendly defender (kings excluded). */
export function loosePieces(chess: Chess, color: 'w' | 'b'): Square[] {
  const out: Square[] = []
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq as never)
    if (!p || p.color !== color || p.type === 'k') continue
    if (defendersOf(chess, sq).length === 0) out.push(sq)
  }
  return out
}

/** Pieces giving check to the side to move. */
export function checkers(chess: Chess): Square[] {
  const turn = chess.turn()
  let king: Square | null = null
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq as never)
    if (p && p.type === 'k' && p.color === turn) king = sq
  }
  if (!king) return []
  return chess.attackers(king as never, turn === 'w' ? 'b' : 'w') as Square[]
}

export function sideName(turn: 'w' | 'b'): string {
  return turn === 'w' ? 'White' : 'Black'
}
