import { Chess } from 'chess.js'
import type { Square } from '../types'

/**
 * King and pawn against king, solved completely. Used only by the content validator and the authoring tools, never in
 * the member's browser, so a lesson's claims about the opposition, key squares, the rule of the square and rook pawns
 * are proven by a program instead of resting on memory.
 *
 * The table covers every position with a White pawn (a Black pawn is handled by flipping the board). A position is a
 * "win" if the pawn's side can force promotion to a piece that is not lost at once and does not stalemate; everything
 * else is a "draw". The table is built by retrograde-style value iteration (positions are marked won until nothing changes),
 * which gives the exact set of forced wins.
 */

const IDX = (file: number, rank: number) => file + 8 * rank
const FILE = (sq: number) => sq & 7
const RANK = (sq: number) => sq >> 3

const kingMoves: number[][] = []
for (let sq = 0; sq < 64; sq++) {
  const list: number[] = []
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue
      const f = FILE(sq) + df
      const r = RANK(sq) + dr
      if (f >= 0 && f < 8 && r >= 0 && r < 8) list.push(IDX(f, r))
    }
  kingMoves.push(list)
}
const adjacent = (a: number, b: number) => a !== b && Math.abs(FILE(a) - FILE(b)) <= 1 && Math.abs(RANK(a) - RANK(b)) <= 1

/** Squares a White pawn on `p` attacks. */
function pawnAttacks(p: number): number[] {
  const out: number[] = []
  if (RANK(p) < 7) {
    if (FILE(p) > 0) out.push(p + 7)
    if (FILE(p) < 7) out.push(p + 9)
  }
  return out
}
const pawnAtt: number[][] = Array.from({ length: 64 }, (_, p) => pawnAttacks(p))

const stateIndex = (p: number, wk: number, bk: number) => ((p - 8) * 64 + wk) * 64 + bk
const STATES = 48 * 64 * 64

/** Squares attacked by a rook on `r` or a queen (when `diag`), with `blockers` stopping the rays and `ghost` treated as empty. */
function slides(from: number, diag: boolean, blocked: (sq: number) => boolean): number[] {
  const out: number[] = []
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  if (diag) dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1])
  for (const [df, dr] of dirs) {
    let f = FILE(from) + df
    let r = RANK(from) + dr
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const sq = IDX(f, r)
      out.push(sq)
      if (blocked(sq)) break
      f += df
      r += dr
    }
  }
  return out
}

/** After White promotes on `q` (a Q or R), is the position a win for White with Black to move? */
function promotionWorks(wk: number, bk: number, q: number, queen: boolean): boolean {
  // the new piece is lost at once if the black king can take it and the white king does not protect it
  if (adjacent(bk, q) && !adjacent(wk, q)) return false
  const attacked = new Set(slides(q, queen, (sq) => sq === wk))
  const bkInCheck = attacked.has(bk)
  let moves = 0
  for (const b of kingMoves[bk]) {
    if (b === wk || adjacent(b, wk)) continue
    if (b === q) {
      moves++ // capturing is legal only when the king is unprotected, and that case returned above
      continue
    }
    if (attacked.has(b)) continue
    moves++
  }
  if (moves === 0) return bkInCheck // checkmate is a win; no moves and no check is stalemate
  return true
}

let tableW: Uint8Array | null = null // white to move: 1 = win
let tableB: Uint8Array | null = null // black to move: 1 = win

function legalW(p: number, wk: number, bk: number): boolean {
  if (p === wk || p === bk || wk === bk || adjacent(wk, bk)) return false
  return !pawnAtt[p].includes(bk) // Black cannot be in check when White is to move
}
function legalB(p: number, wk: number, bk: number): boolean {
  return !(p === wk || p === bk || wk === bk || adjacent(wk, bk))
}

function build(): void {
  const W = new Uint8Array(STATES)
  const B = new Uint8Array(STATES)
  let changed = true
  while (changed) {
    changed = false
    for (let p = 8; p < 56; p++) {
      for (let wk = 0; wk < 64; wk++) {
        for (let bk = 0; bk < 64; bk++) {
          const s = stateIndex(p, wk, bk)
          // White to move
          if (!W[s] && legalW(p, wk, bk)) {
            let win = false
            for (const k of kingMoves[wk]) {
              if (k === p || adjacent(k, bk) || k === bk) continue
              if (B[stateIndex(p, k, bk)]) {
                win = true
                break
              }
            }
            if (!win) {
              const front = p + 8
              if (front !== wk && front !== bk) {
                if (RANK(p) === 6) win = promotionWorks(wk, bk, front, true) || promotionWorks(wk, bk, front, false)
                else {
                  if (B[stateIndex(front, wk, bk)]) win = true
                  else if (RANK(p) === 1 && p + 16 !== wk && p + 16 !== bk && B[stateIndex(p + 16, wk, bk)]) win = true
                }
              }
            }
            if (win) {
              W[s] = 1
              changed = true
            }
          }
          // Black to move
          if (!B[s] && legalB(p, wk, bk)) {
            let moves = 0
            let allWin = true
            for (const b of kingMoves[bk]) {
              if (b === wk || adjacent(b, wk) || pawnAtt[p].includes(b)) continue
              moves++
              if (b === p) {
                allWin = false // the king takes an unprotected pawn: a draw
                break
              }
              if (!W[stateIndex(p, wk, b)]) {
                allWin = false
                break
              }
            }
            if (moves === 0) {
              if (pawnAtt[p].includes(bk)) {
                B[s] = 1 // checkmate by the pawn
                changed = true
              }
            } else if (allWin) {
              B[s] = 1
              changed = true
            }
          }
        }
      }
    }
  }
  tableW = W
  tableB = B
}

function tables(): { W: Uint8Array; B: Uint8Array } {
  if (!tableW || !tableB) build()
  return { W: tableW as Uint8Array, B: tableB as Uint8Array }
}

const sqNum = (sq: string) => IDX(sq.charCodeAt(0) - 97, Number(sq[1]) - 1)
const sqName = (n: number) => String.fromCharCode(97 + FILE(n)) + (RANK(n) + 1)

interface Kpk {
  p: number
  wk: number
  bk: number
  whiteToMove: boolean
  /** True if the pawn is Black's and the position was flipped into the White-pawn table. */
  flipped: boolean
}

/** The position as a White-pawn table entry, or null if it is not exactly two kings and one pawn. */
export function kpkPosition(chess: Chess): Kpk | null {
  let pawn: { sq: string; color: 'w' | 'b' } | null = null
  let wk = ''
  let bk = ''
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue
      if (piece.type === 'k') {
        if (piece.color === 'w') wk = piece.square
        else bk = piece.square
      } else if (piece.type === 'p' && !pawn) pawn = { sq: piece.square, color: piece.color }
      else return null
    }
  }
  if (!pawn || !wk || !bk) return null
  const flip = (sq: string) => sq[0] + String(9 - Number(sq[1]))
  if (pawn.color === 'w') return { p: sqNum(pawn.sq), wk: sqNum(wk), bk: sqNum(bk), whiteToMove: chess.turn() === 'w', flipped: false }
  // a Black pawn: turn the board upside down and swap the colours
  return { p: sqNum(flip(pawn.sq)), wk: sqNum(flip(bk)), bk: sqNum(flip(wk)), whiteToMove: chess.turn() === 'b', flipped: true }
}

/**
 * "win" if the side that owns the pawn forces promotion (to a queen or rook that is not lost at once) with best play from
 * both sides, "draw" otherwise. Null if the position is not king and pawn against king.
 */
export function kpkResult(chess: Chess): 'win' | 'draw' | null {
  const k = kpkPosition(chess)
  if (!k) return null
  if (k.p < 8 || k.p > 55) return null
  const legal = k.whiteToMove ? legalW(k.p, k.wk, k.bk) : legalB(k.p, k.wk, k.bk)
  if (!legal) return null
  const { W, B } = tables()
  return (k.whiteToMove ? W : B)[stateIndex(k.p, k.wk, k.bk)] ? 'win' : 'draw'
}

/**
 * Every legal move (SAN) that keeps the result for the side to move: for the side with the pawn, the moves that keep the win;
 * for the defender, the moves that keep the draw (including taking the pawn). Null if the position is not king and pawn against king.
 */
export function kpkKeepingMoves(chess: Chess): string[] | null {
  const here = kpkResult(chess)
  if (here === null) return null
  const mover = chess.turn()
  const pawnSide = kpkPawnColor(chess)
  const out: string[] = []
  for (const m of chess.moves({ verbose: true })) {
    const d = new Chess(chess.fen())
    d.move(m.san)
    let next: 'win' | 'draw'
    if (m.captured === 'p') next = 'draw' // the pawn is gone
    else if (m.promotion) {
      if (m.promotion !== 'q' && m.promotion !== 'r') next = 'draw'
      else {
        // the new piece must not be taken at once, and Black must not be stalemated
        const taken = d.moves({ verbose: true }).some((x) => x.to === m.to && x.captured)
        next = !taken && !d.isStalemate() ? 'win' : 'draw'
      }
    } else next = kpkResult(d) ?? 'draw'
    if (mover === pawnSide ? next === 'win' : next === 'draw') out.push(m.san)
  }
  return out
}

function kpkPawnColor(chess: Chess): 'w' | 'b' {
  for (const row of chess.board()) for (const piece of row) if (piece && piece.type === 'p') return piece.color
  return 'w'
}

/**
 * Key squares for a White pawn on `pawn`: squares where, if the White king stands on one, White wins whatever Black's king
 * does and whoever is to move. (Found by checking every legal position.)
 */
export function kpkKeySquares(pawn: Square): Square[] {
  const { W, B } = tables()
  const p = sqNum(pawn)
  const out: Square[] = []
  for (let wk = 0; wk < 64; wk++) {
    if (wk === p) continue
    let all = true
    let any = false
    for (let bk = 0; bk < 64 && all; bk++) {
      if (legalW(p, wk, bk)) {
        any = true
        if (!W[stateIndex(p, wk, bk)]) all = false
      }
      if (legalB(p, wk, bk)) {
        any = true
        if (!B[stateIndex(p, wk, bk)]) all = false
      }
    }
    if (any && all) out.push(sqName(wk) as Square)
  }
  return out
}

/** For tests: how many White-to-move positions are won. */
export function kpkWonCount(): { whiteToMove: number; blackToMove: number } {
  const { W, B } = tables()
  let w = 0
  let b = 0
  for (let i = 0; i < STATES; i++) {
    w += W[i]
    b += B[i]
  }
  return { whiteToMove: w, blackToMove: b }
}

/** For tests: the raw tables (1 = win), indexed by ((pawn - 8) * 64 + whiteKing) * 64 + blackKing with squares numbered a1 = 0 ... h8 = 63. */
export function kpkTables(): { W: Uint8Array; B: Uint8Array } {
  return tables()
}
