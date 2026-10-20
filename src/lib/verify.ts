import { Chess, type Move } from 'chess.js'
import type { Square } from '../types'
import { ALL_SQUARES, PIECE_VALUE, attackersOf, defendersOf } from './chessUtil'

/**
 * Chess facts used by the content validator. Nothing here runs in the member's browser.
 * They exist so that when a lesson says "this piece is loose" or "this move blocks the attack",
 * a program, not just a person, has checked it.
 */

/** Net material the side that captures first can win on `sq` (>= 0). Ignores x-rays; fine for lesson positions. */
function exchange(targetValue: number, attackers: number[], defenders: number[]): number {
  if (!attackers.length) return 0
  const [a, ...rest] = attackers
  const afterRecapture = exchange(a, defenders, rest)
  return Math.max(0, targetValue - afterRecapture)
}

/** Can the owner of the piece on `sq` lose material there if the opponent starts capturing? */
export function isSafe(chess: Chess, sq: Square): boolean {
  const piece = chess.get(sq as never)
  if (!piece) return true
  const val = (s: Square) => PIECE_VALUE[chess.get(s as never)!.type]
  const attackers = attackersOf(chess, sq).map(val).sort((a, b) => a - b)
  const defenders = defendersOf(chess, sq).map(val).sort((a, b) => a - b)
  return exchange(PIECE_VALUE[piece.type], attackers, defenders) === 0
}

export type AnswerMethod = 'move' | 'capture' | 'block' | 'defend'
export type AnswerWanted = AnswerMethod | 'any'

function between(a: Square, b: Square): Square[] {
  const af = a.charCodeAt(0) - 97
  const ar = Number(a[1]) - 1
  const bf = b.charCodeAt(0) - 97
  const br = Number(b[1]) - 1
  const df = Math.sign(bf - af)
  const dr = Math.sign(br - ar)
  const aligned = af === bf || ar === br || Math.abs(bf - af) === Math.abs(br - ar)
  if (!aligned) return []
  const out: Square[] = []
  let f = af + df
  let r = ar + dr
  while (f !== bf || r !== br) {
    out.push(String.fromCharCode(97 + f) + String(r + 1))
    f += df
    r += dr
  }
  return out
}

/**
 * How does `move` answer an attack on the piece on `target`?
 * Returns the method, or null if the piece is still in trouble afterwards.
 */
export function classifyAnswer(chess: Chess, target: Square, move: Move): AnswerMethod | null {
  const attackers = attackersOf(chess, target)
  const wasSafe = isSafe(chess, target)
  const slidersBetween = attackers.filter((a) => {
    const t = chess.get(a as never)!.type
    return t === 'b' || t === 'r' || t === 'q'
  })
  const blockSquares = new Set<Square>(slidersBetween.flatMap((a) => between(a, target)))

  chess.move(move.san)
  const now = move.from === target ? (move.to as Square) : target
  const safeNow = isSafe(chess, now)
  chess.undo()
  if (!safeNow) return null

  if (move.captured && attackers.includes(move.to as Square)) return 'capture'
  if (move.from === target) return 'move'
  if (blockSquares.has(move.to as Square)) return 'block'
  if (!wasSafe) return 'defend'
  return null
}

/** Every legal move (SAN) of the side to move that answers the attack on `target` the wanted way. */
export function answersByMethod(chess: Chess, target: Square, method: AnswerWanted): string[] {
  const out: string[] = []
  for (const m of chess.moves({ verbose: true })) {
    const got = classifyAnswer(chess, target, m)
    if (got !== null && (method === 'any' || got === method)) out.push(m.san)
  }
  return out
}

/** Squares of pieces of `color` that are attacked and not safe (a "hanging" piece). */
export function hangingPieces(chess: Chess, color: 'w' | 'b'): Square[] {
  return ALL_SQUARES.filter((sq) => {
    const p = chess.get(sq as never)
    return !!p && p.color === color && p.type !== 'k' && attackersOf(chess, sq).length > 0 && !isSafe(chess, sq)
  })
}
