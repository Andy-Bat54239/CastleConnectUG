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

/**
 * Every legal move of the piece on `square`, for either side (the turn is flipped if the piece does not belong
 * to the side to move). Returns null if the position cannot be set up that way.
 */
export function movesOfPiece(chess: Chess, square: Square) {
  const piece = chess.get(square as never)
  if (!piece) return null
  try {
    let probe = chess
    if (piece.color !== chess.turn()) {
      const parts = chess.fen().split(' ')
      parts[1] = piece.color
      parts[3] = '-'
      probe = new Chess(parts.join(' '))
    }
    return probe.moves({ square: square as never, verbose: true })
  } catch {
    return null
  }
}

/** A position as far as repetition is concerned: where everything stands and whose move it is (not the move counters). */
export function positionKey(chess: Chess): string {
  return chess.fen().split(' ').slice(0, 4).join(' ')
}

function givesCheck(san: string): boolean {
  return san.endsWith('+')
}

/** After our checking move: is there a way to keep checking until a position repeats, with the opponent's only legal move every time? */
function checksCycle(afterOurMove: Chess, seen: Set<string>, checksLeft: number): boolean {
  const replies = afterOurMove.moves()
  if (replies.length !== 1) return false // they have a choice (or nothing legal): not a forced cycle
  afterOurMove.move(replies[0])
  let found = false
  for (const m of afterOurMove.moves()) {
    if (!givesCheck(m)) continue
    afterOurMove.move(m)
    const key = positionKey(afterOurMove)
    if (seen.has(key)) found = true
    else if (checksLeft > 0) found = checksCycle(afterOurMove, new Set(seen).add(key), checksLeft - 1)
    afterOurMove.undo()
    if (found) break
  }
  afterOurMove.undo()
  return found
}

/**
 * First moves (SAN) with which the side to move can force a perpetual check: a run of checks in which the
 * opponent's reply is always their only legal move, until a position repeats. Used to prove "this is a draw by repetition".
 */
export function perpetualMoves(chess: Chess, maxChecks = 4): string[] {
  const out: string[] = []
  for (const m of chess.moves()) {
    if (!givesCheck(m)) continue
    const c = new Chess(chess.fen())
    c.move(m)
    if (checksCycle(c, new Set([positionKey(c)]), maxChecks - 1)) out.push(m)
  }
  return out
}

/**
 * First moves (SAN) after which the opponent has exactly one legal move, and playing it leaves the first player
 * stalemated: the classic "sacrifice to draw". Used to prove a stalemate trick really works.
 */
export function stalemateTrapMoves(chess: Chess): string[] {
  const me = chess.turn()
  const out: string[] = []
  for (const m of chess.moves()) {
    const c = new Chess(chess.fen())
    c.move(m)
    const replies = c.moves()
    if (replies.length !== 1) continue
    c.move(replies[0])
    if (c.isStalemate() && c.turn() === me) out.push(m)
  }
  return out
}

/** Pawns of `color` with no friendly pawn on either neighbouring file: nothing can ever protect them from behind. */
export function isolatedPawns(chess: Chess, color: 'w' | 'b'): Square[] {
  const pawnFiles = new Set<number>()
  const pawns: Square[] = []
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq as never)
    if (p && p.type === 'p' && p.color === color) {
      pawns.push(sq)
      pawnFiles.add(FILE(sq))
    }
  }
  return pawns.filter((sq) => !pawnFiles.has(FILE(sq) - 1) && !pawnFiles.has(FILE(sq) + 1))
}

/** Files (as letters) that have no pawn of either colour on them. */
export function openFiles(chess: Chess): string[] {
  const used = new Set<string>()
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq as never)
    if (p && p.type === 'p') used.add(sq[0])
  }
  return 'abcdefgh'.split('').filter((f) => !used.has(f))
}

/**
 * A simple measure of space: how many squares on the opponent's half of the board (ranks 5 to 8 for White,
 * ranks 1 to 4 for Black) the side attacks with any of its pieces and pawns.
 */
export function spaceCount(chess: Chess, color: 'w' | 'b'): number {
  return ALL_SQUARES.filter((sq) => (color === 'w' ? RANK(sq) >= 4 : RANK(sq) <= 3) && chess.attackers(sq as never, color).length > 0).length
}

/** How many legal moves `color` has in this position (the turn is flipped if it is not their move). Null if the position cannot be set up that way. */
export function mobility(chess: Chess, color: 'w' | 'b'): number | null {
  if (chess.turn() === color) return chess.moves().length
  try {
    const parts = chess.fen().split(' ')
    parts[1] = color
    parts[3] = '-'
    return new Chess(parts.join(' ')).moves().length
  } catch {
    return null
  }
}

/** Knights and bishops that have left their starting squares: a simple count of development. */
export function developedPieces(chess: Chess, color: 'w' | 'b'): number {
  const home = color === 'w' ? ['b1', 'g1', 'c1', 'f1'] : ['b8', 'g8', 'c8', 'f8']
  return home.filter((sq) => {
    const p = chess.get(sq as never)
    return !(p && p.color === color && (p.type === 'n' || p.type === 'b'))
  }).length
}

/** White's material minus Black's (pawn 1, knight and bishop 3, rook 5, queen 9). */
export function materialDiff(chess: Chess): number {
  const white = chess.turn() === 'w' ? staticEval(chess) : -staticEval(chess)
  return white
}

function pawnsOf(chess: Chess, color: 'w' | 'b'): Square[] {
  return ALL_SQUARES.filter((sq) => {
    const p = chess.get(sq as never)
    return !!p && p.type === 'p' && p.color === color
  })
}

/** Pawns of `color` that share a file with another pawn of the same colour. */
export function doubledPawns(chess: Chess, color: 'w' | 'b'): Square[] {
  const pawns = pawnsOf(chess, color)
  return pawns.filter((sq) => pawns.filter((o) => FILE(o) === FILE(sq)).length >= 2)
}

/** Passed pawns of `color`: no enemy pawn in front of them on the same file or a neighbouring file. */
export function passedPawns(chess: Chess, color: 'w' | 'b'): Square[] {
  const enemy = pawnsOf(chess, color === 'w' ? 'b' : 'w')
  return pawnsOf(chess, color).filter((sq) => !enemy.some((e) => Math.abs(FILE(e) - FILE(sq)) <= 1 && (color === 'w' ? RANK(e) > RANK(sq) : RANK(e) < RANK(sq))))
}

/**
 * Backward pawns of `color`: a pawn with a friendly pawn on a neighbouring file, but none of those neighbours is level with it
 * or behind it (so nothing can ever protect it), and the square in front of it is attacked by an enemy pawn (so it cannot advance safely).
 */
export function backwardPawns(chess: Chess, color: 'w' | 'b'): Square[] {
  const mine = pawnsOf(chess, color)
  const enemy = pawnsOf(chess, color === 'w' ? 'b' : 'w')
  const dir = color === 'w' ? 1 : -1
  return mine.filter((sq) => {
    const neighbours = mine.filter((o) => Math.abs(FILE(o) - FILE(sq)) === 1)
    if (!neighbours.length) return false // an isolated pawn is a different weakness
    if (neighbours.some((o) => (RANK(o) - RANK(sq)) * dir <= 0)) return false // a neighbour can still support it
    const stopRank = RANK(sq) + dir
    // an enemy pawn attacks the stop square from the file beside it, one rank further on
    return enemy.some((e) => Math.abs(FILE(e) - FILE(sq)) === 1 && RANK(e) === stopRank + dir)
  })
}

/**
 * Outpost squares for `color`: squares on its fifth or sixth rank (third or fourth for Black), not holding a pawn, that no enemy pawn
 * can ever attack and that one of its own pawns protects.
 */
export function outpostSquares(chess: Chess, color: 'w' | 'b'): Square[] {
  const mine = pawnsOf(chess, color)
  const enemy = pawnsOf(chess, color === 'w' ? 'b' : 'w')
  const dir = color === 'w' ? 1 : -1
  return ALL_SQUARES.filter((sq) => {
    const r = RANK(sq)
    if (color === 'w' ? r < 4 || r > 5 : r < 2 || r > 3) return false
    const there = chess.get(sq as never)
    if (there && there.type === 'p') return false
    // enemy pawns that are level with or beyond this square (from their point of view) on a neighbouring file can attack it
    if (enemy.some((e) => Math.abs(FILE(e) - FILE(sq)) === 1 && (RANK(e) - r) * dir > 0)) return false
    return mine.some((m) => Math.abs(FILE(m) - FILE(sq)) === 1 && RANK(m) === r - dir)
  })
}
