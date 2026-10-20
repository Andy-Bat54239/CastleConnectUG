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

/**
 * Can the side to move force checkmate within `n` of its own moves, whatever the opponent answers?
 * A full search of every reply, so keep `n` small (3 is fine for endgames with few pieces).
 * Stalemate and other draws count as failures.
 */
export function canForceMate(chess: Chess, n: number): boolean {
  if (n <= 0) return false
  for (const m of chess.moves()) {
    chess.move(m)
    let wins: boolean
    if (chess.isCheckmate()) wins = true
    else if (n === 1 || chess.isGameOver()) wins = false
    else {
      wins = true
      for (const reply of chess.moves()) {
        chess.move(reply)
        const next = canForceMate(chess, n - 1)
        chess.undo()
        if (!next) {
          wins = false
          break
        }
      }
    }
    chess.undo()
    if (wins) return true
  }
  return false
}

/** The first moves (SAN) that force checkmate within `n` moves. Used when writing lessons, to see every right answer. */
export function forcedMateMoves(chess: Chess, n: number): string[] {
  const out: string[] = []
  for (const m of chess.moves()) {
    chess.move(m)
    let wins: boolean
    if (chess.isCheckmate()) wins = true
    else if (n <= 1 || chess.isGameOver()) wins = false
    else {
      wins = true
      for (const reply of chess.moves()) {
        chess.move(reply)
        const next = canForceMate(chess, n - 1)
        chess.undo()
        if (!next) {
          wins = false
          break
        }
      }
    }
    chess.undo()
    if (wins) out.push(m)
  }
  return out
}

/**
 * Check a stored line that ends in checkmate (your move, their reply, your move...). Playing the line must
 * work AND it must be forced: at every point, whatever else the opponent could have replied, you still mate in
 * the moves you have left. Returns what is wrong, or null when the line is a genuine forced mate.
 */
export function lineIsForcedMate(startFen: string, line: string[]): string | null {
  const chess = new Chess(startFen)
  const solverMoves = (line.length + 1) / 2
  for (let i = 0; i < line.length; i++) {
    chess.move(line[i])
    if (i % 2 === 0 && i < line.length - 1) {
      const left = solverMoves - (i / 2 + 1)
      for (const reply of chess.moves()) {
        chess.move(reply)
        const ok = canForceMate(chess, left)
        chess.undo()
        if (!ok) return `after ${line[i]}, ${reply} lets the opponent escape: it is not a forced mate in ${solverMoves}`
      }
    }
  }
  return chess.isCheckmate() ? null : 'the line does not end in checkmate'
}
