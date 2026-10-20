import { Chess } from 'chess.js'
import type { Square } from '../types'
import { ALL_SQUARES, attacksOf } from './chessUtil'

/**
 * Chess facts about tactics (forks, pins, skewers and material won). Used only by the content validator and
 * the authoring tools, never in the member's browser, so a lesson's claims ("this fork wins a rook", "this
 * piece is pinned") are checked by a program and not only by a person.
 */

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const MATE = 1000
const FILE = (sq: Square) => sq.charCodeAt(0) - 97
const RANK = (sq: Square) => Number(sq[1]) - 1

/** Material (pawn 1, minor 3, rook 5, queen 9) from the point of view of the side to move. */
export function staticEval(chess: Chess): number {
  let white = 0
  let black = 0
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p) continue
      if (p.color === 'w') white += VALUE[p.type]
      else black += VALUE[p.type]
    }
  }
  return chess.turn() === 'w' ? white - black : black - white
}

/** Resolve captures (and escapes from check) so a position is not scored in the middle of an exchange. */
function quiesce(chess: Chess, alpha: number, beta: number, depth: number): number {
  if (chess.isCheckmate()) return -MATE
  const inCheck = chess.isCheck()
  let best = -Infinity
  if (!inCheck) {
    const stand = staticEval(chess)
    if (stand >= beta) return stand
    best = stand
    if (stand > alpha) alpha = stand
  }
  if (depth === 0) return inCheck ? staticEval(chess) : best
  const moves = chess.moves({ verbose: true }).filter((m) => inCheck || m.captured)
  for (const m of moves) {
    chess.move(m)
    const score = -quiesce(chess, -beta, -alpha, depth - 1)
    chess.undo()
    if (score > best) best = score
    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }
  return best
}

function negamax(chess: Chess, depth: number, alpha: number, beta: number): number {
  if (chess.isCheckmate()) return -MATE - depth
  if (chess.isDraw()) return 0
  if (depth === 0) return quiesce(chess, alpha, beta, 6)
  const moves = chess.moves({ verbose: true }).sort((a, b) => Number(!!b.captured) - Number(!!a.captured))
  let best = -Infinity
  for (const m of moves) {
    chess.move(m)
    const score = -negamax(chess, depth - 1, -beta, -alpha)
    chess.undo()
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

/**
 * Points of material the side to move wins by force with `san`, against the opponent's best defence
 * (looking `depth` more plies ahead after the move: by default their reply and your answer, then following
 * every capture so exchanges are settled). A fork that wins a rook scores 5.
 * Mates score in the hundreds.
 */
export function moveGain(fen: string, san: string, depth = 2): number {
  const chess = new Chess(fen)
  const base = staticEval(chess)
  chess.move(san)
  return -negamax(chess, depth, -Infinity, Infinity) - base
}

/**
 * Does `san` win at least `minGain` points by force? Same answer as `moveGain(...) >= minGain`, but much faster:
 * it only asks "is it at least this much?" (a null-window search), so most non-winning moves are refuted at once.
 */
export function winsAtLeast(fen: string, san: string, minGain: number, depth = 2): boolean {
  const chess = new Chess(fen)
  const base = staticEval(chess)
  chess.move(san)
  const target = base + minGain // the mover needs a final score of at least this, so the opponent's score must be <= -target
  const score = negamax(chess, depth, -target, -target + 1)
  return score <= -target
}

/** Every first move (SAN) that wins at least `minGain` points by force. */
export function winningMoves(fen: string, minGain: number, depth = 2): string[] {
  const chess = new Chess(fen)
  return chess.moves().filter((m) => winsAtLeast(fen, m, minGain, depth))
}

/** Pieces of `color` pinned to their own king: if one moved away, the king would be in check from a new attacker. */
export function pinnedPieces(chess: Chess, color: 'w' | 'b'): Square[] {
  const enemy = color === 'w' ? 'b' : 'w'
  const king = ALL_SQUARES.find((s) => {
    const p = chess.get(s as never)
    return p && p.type === 'k' && p.color === color
  })
  if (!king) return []
  const before = new Set(chess.attackers(king as never, enemy))
  const out: Square[] = []
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq as never)
    if (!p || p.color !== color || p.type === 'k') continue
    const probe = new Chess(chess.fen())
    probe.remove(sq as never)
    const after = probe.attackers(king as never, enemy)
    if (after.some((a) => !before.has(a))) out.push(sq)
  }
  return out
}

/**
 * Do these three pieces line up like a pin or a skewer? `attacker` is a rook, bishop or queen that sees
 * `front` first and `back` behind it, with both victims on the other side. If the front piece is worth less
 * than the one behind it, it is a **pin** (it should not move). If it is worth more, it is a **skewer**
 * (it must move, and the piece behind falls). A king counts as priceless.
 */
export function alignment(chess: Chess, attacker: Square, front: Square, back: Square): 'pin' | 'skewer' | null {
  const a = chess.get(attacker as never)
  const f = chess.get(front as never)
  const b = chess.get(back as never)
  if (!a || !f || !b) return null
  if (a.color === f.color || f.color !== b.color) return null
  const dx = Math.sign(FILE(front) - FILE(attacker))
  const dy = Math.sign(RANK(front) - RANK(attacker))
  const diagonal = Math.abs(FILE(front) - FILE(attacker)) === Math.abs(RANK(front) - RANK(attacker))
  const straight = FILE(front) === FILE(attacker) || RANK(front) === RANK(attacker)
  if (!diagonal && !straight) return null
  if (a.type === 'r' && !straight) return null
  if (a.type === 'b' && !diagonal) return null
  if (a.type !== 'r' && a.type !== 'b' && a.type !== 'q') return null
  // walk attacker -> front -> back along one line, with nothing in between
  let f0 = FILE(attacker) + dx
  let r0 = RANK(attacker) + dy
  const at = (file: number, rank: number) => String.fromCharCode(97 + file) + String(rank + 1)
  while (at(f0, r0) !== front) {
    if (f0 < 0 || f0 > 7 || r0 < 0 || r0 > 7 || chess.get(at(f0, r0) as never)) return null
    f0 += dx
    r0 += dy
  }
  f0 += dx
  r0 += dy
  while (at(f0, r0) !== back) {
    if (f0 < 0 || f0 > 7 || r0 < 0 || r0 > 7 || chess.get(at(f0, r0) as never)) return null
    f0 += dx
    r0 += dy
  }
  const worth = (t: string) => (t === 'k' ? 100 : VALUE[t])
  if (worth(f.type) < worth(b.type)) return 'pin'
  if (worth(f.type) > worth(b.type)) return 'skewer'
  return null
}

/**
 * Squares the piece on `from` can legally move to from which it would attack two or more enemy pieces
 * (pawns are not counted as targets).
 * Works for either side (the turn is flipped if needed). Returns null if the position cannot be set up.
 */
export function forkSquares(chess: Chess, from: Square): Square[] | null {
  const piece = chess.get(from as never)
  if (!piece) return null
  let probe: Chess
  try {
    const parts = chess.fen().split(' ')
    parts[1] = piece.color
    parts[3] = '-'
    probe = new Chess(parts.join(' '))
  } catch {
    return null
  }
  const out = new Set<Square>()
  for (const m of probe.moves({ square: from as never, verbose: true })) {
    probe.move(m)
    // A fork wins something real: pawns do not count as targets (two pawns attacked is not what we teach as a fork).
    const hits = attacksOf(probe, m.to as Square).filter((s) => {
      const q = probe.get(s as never)
      return q && q.color !== piece.color && q.type !== 'p'
    })
    probe.undo()
    if (hits.length >= 2) out.add(m.to as Square)
  }
  return [...out]
}
