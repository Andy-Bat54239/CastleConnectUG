/**
 * Content validator. Run with `npm run validate` (also runs before every build).
 *
 * It checks the shape of every day file AND the chess in it: positions are legal, every stored
 * move is legal and written exactly, every checkmate claim is a real checkmate, and statements
 * about attacked/defended/loose pieces are true. A lesson with a wrong position cannot ship.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Chess } from 'chess.js'
import type { BoardAssert, Card, DayContent } from '../src/types'
import {
  ALL_SQUARES,
  attacksOf,
  checkers,
  defendersOf,
  hasMateInOne,
  isFileRank,
  loosePieces,
  mateAvoidingMoves,
  matingMoves,
} from '../src/lib/chessUtil'
import { estimateMinutes } from '../src/lib/estimate'
import { answersByMethod, classifyAnswer, isSafe } from '../src/lib/verify'

// BG_CONTENT_DIR lets the tests point the validator at a scratch folder.
const ROOT = process.env.BG_CONTENT_DIR ? resolve(process.env.BG_CONTENT_DIR) + '/' : new URL('../content/', import.meta.url).pathname
let errors = 0
let warnings = 0
let where = ''

let muted = false
const err = (msg: string) => {
  if (muted) return
  errors++
  console.error(`  ✗ ${where}: ${msg}`)
}
const warn = (msg: string) => {
  warnings++
  console.warn(`  ! ${where}: ${msg}`)
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** Reject keys we do not know, so a typo like "solutoin" cannot silently do nothing. */
function onlyKeys(o: Obj, allowed: string[]) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) err(`unknown field "${k}" (allowed: ${allowed.join(', ')})`)
}

function need(o: Obj, key: string, kind: 'string' | 'array' | 'number' | 'object'): boolean {
  const v = o[key]
  const ok = kind === 'string' ? isStr(v) : kind === 'array' ? Array.isArray(v) : kind === 'number' ? typeof v === 'number' : isObj(v)
  if (!ok) err(`missing or invalid "${key}" (expected ${kind})`)
  return ok
}

function loadFen(fen: unknown, label: string): Chess | null {
  if (!isStr(fen)) {
    err(`${label}: missing FEN`)
    return null
  }
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch (e) {
    err(`${label}: illegal position (${(e as Error).message}) in "${fen}"`)
    return null
  }
  // chess.js lets through positions where the side NOT to move is already in check. They cannot occur in a game.
  const mover = chess.turn()
  const other = mover === 'w' ? 'b' : 'w'
  const kingSq = ALL_SQUARES.find((s) => {
    const p = chess.get(s as never)
    return p && p.type === 'k' && p.color === other
  })
  if (kingSq && chess.attackers(kingSq as never, mover).length > 0) {
    err(`${label}: the side that just moved is in check, which cannot happen in a real game ("${fen}"). Flip the side to move.`)
    return null
  }
  return chess
}

function checkSquares(list: unknown, label: string): string[] {
  if (!Array.isArray(list)) {
    err(`${label}: expected a list of squares`)
    return []
  }
  const out: string[] = []
  for (const s of list) {
    if (typeof s !== 'string' || !isFileRank(s)) err(`${label}: "${String(s)}" is not a square like e4`)
    else out.push(s)
  }
  return out
}

function checkArrows(arrows: unknown, label: string) {
  if (arrows === undefined) return
  if (!Array.isArray(arrows)) return err(`${label}: arrows must be a list of [from, to]`)
  for (const a of arrows) {
    if (!Array.isArray(a) || a.length !== 2) err(`${label}: each arrow must be [from, to]`)
    else checkSquares(a, `${label} arrow`)
  }
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join()
}

function checkAssert(chess: Chess, a: BoardAssert, highlight: string[], label: string) {
  const known = ['status', 'attackCount', 'highlightIsAttacksOf', 'undefended', 'defended', 'attacked']
  onlyKeys(a as Obj, known)
  if (a.status) {
    const actual = chess.isCheckmate()
      ? 'checkmate'
      : chess.isStalemate()
        ? 'stalemate'
        : chess.isInsufficientMaterial()
          ? 'insufficient'
          : chess.isCheck()
            ? 'check'
            : 'normal'
    if (actual !== a.status) err(`${label}: lesson says this position is ${a.status}, but it is ${actual}`)
  }
  for (const [sq, n] of Object.entries(a.attackCount ?? {})) {
    if (!chess.get(sq as never)) err(`${label}: attackCount square ${sq} is empty`)
    else if (attacksOf(chess, sq).length !== n) err(`${label}: the piece on ${sq} attacks ${attacksOf(chess, sq).length} squares, not ${n}`)
  }
  if (a.highlightIsAttacksOf) {
    const sq = a.highlightIsAttacksOf
    if (!chess.get(sq as never)) err(`${label}: highlightIsAttacksOf square ${sq} is empty`)
    else if (!sameSet(attacksOf(chess, sq), highlight)) err(`${label}: highlighted squares (${highlight.join(' ')}) are not exactly what ${sq} attacks (${attacksOf(chess, sq).join(' ')})`)
  }
  for (const sq of a.undefended ?? []) {
    if (!chess.get(sq as never)) err(`${label}: undefended square ${sq} is empty`)
    else if (defendersOf(chess, sq).length) err(`${label}: the piece on ${sq} is defended by ${defendersOf(chess, sq).join(' ')}`)
  }
  for (const sq of a.defended ?? []) {
    if (!chess.get(sq as never)) err(`${label}: defended square ${sq} is empty`)
    else if (!defendersOf(chess, sq).length) err(`${label}: the piece on ${sq} has no defender`)
  }
  for (const sq of a.attacked ?? []) {
    const p = chess.get(sq as never)
    if (!p) err(`${label}: attacked square ${sq} is empty`)
    else if (!chess.attackers(sq as never, p.color === 'w' ? 'b' : 'w').length) err(`${label}: the piece on ${sq} is not attacked`)
  }
}

function checkBoard(b: unknown, label: string): Chess | null {
  if (!isObj(b)) {
    err(`${label}: board must be an object with a "fen"`)
    return null
  }
  onlyKeys(b, ['fen', 'caption', 'highlight', 'arrows', 'flip', 'assert'])
  const chess = loadFen(b.fen, label)
  const highlight = b.highlight === undefined ? [] : checkSquares(b.highlight, `${label} highlight`)
  checkArrows(b.arrows, label)
  if (chess && isObj(b.assert)) checkAssert(chess, b.assert as BoardAssert, highlight, label)
  return chess
}

/** Play a stored line move by move; every move must be legal and written exactly as chess.js would write it. */
function playLine(fen: string, line: unknown, label: string): Chess | null {
  const chess = loadFen(fen, label)
  if (!chess) return null
  if (!Array.isArray(line) || !line.length) {
    err(`${label}: solution must be a non-empty list of moves`)
    return null
  }
  for (let i = 0; i < line.length; i++) {
    const want = line[i]
    if (typeof want !== 'string') {
      err(`${label}: move ${i + 1} is not text`)
      return null
    }
    try {
      const m = chess.move(want)
      if (want.includes('#') && !m.san.includes('#')) err(`${label}: move ${i + 1} "${want}" is marked as checkmate, but ${m.san} is not checkmate here`)
      else if (m.san !== want) err(`${label}: move ${i + 1} is written "${want}" but should be written "${m.san}"`)
    } catch {
      err(`${label}: move ${i + 1} "${want}" is not legal in that position (${chess.fen()})`)
      return null
    }
  }
  return chess
}

function checkChoice(c: Obj) {
  onlyKeys(c, ['type', 'prompt', 'board', 'options', 'answer', 'explain'])
  need(c, 'prompt', 'string')
  need(c, 'explain', 'string')
  if (c.board !== undefined) checkBoard(c.board, 'board')
  if (need(c, 'options', 'array')) {
    const o = c.options as unknown[]
    if (o.length < 2 || o.length > 4) err('a choice needs 2 to 4 options')
    if (!o.every(isStr)) err('every option must be text')
    if (typeof c.answer !== 'number' || !Number.isInteger(c.answer) || c.answer < 0 || c.answer >= o.length) err('"answer" must be the number of the right option, counting from 0')
  }
}

function checkFindMove(c: Obj) {
  onlyKeys(c, ['type', 'prompt', 'fen', 'goal', 'solution', 'accept', 'hint', 'explain', 'highlight', 'arrows', 'verify'])
  need(c, 'prompt', 'string')
  need(c, 'explain', 'string')
  const goal = (c.goal ?? 'san') as string
  if (!['san', 'mate', 'avoidMate', 'answer'].includes(goal)) err(`unknown goal "${goal}"`)
  if (c.highlight !== undefined) checkSquares(c.highlight, 'highlight')
  checkArrows(c.arrows, 'findMove')
  const fen = c.fen as string
  const start = loadFen(fen, 'fen')
  if (!start) return
  if (start.isGameOver()) return err('fen: the game is already over in this position')

  if (goal === 'mate') {
    const mates = matingMoves(start)
    if (!mates.length) err('goal is "mate" but this position has no checkmate in one')
  } else if (goal === 'avoidMate') {
    let threat = false
    try {
      const probe = new Chess(fen.replace(/ [wb] /, (m) => (m === ' w ' ? ' b ' : ' w ')).replace(/ [a-h][36] /, ' - '))
      threat = hasMateInOne(probe)
    } catch {
      /* flipping the turn made the position illegal: the mover is in check, so there is no separate threat to test */
    }
    if (!threat) err('goal is "avoidMate" but the opponent has no mate-in-one threat here, so every move would pass')
    const safe = mateAvoidingMoves(start)
    if (!safe.length) err('goal is "avoidMate" but no move stops the mate')
    if (safe.length === start.moves().length) err('goal is "avoidMate" but every move stops the mate')
  } else if (goal === 'answer') {
    const v = c.verify as { method?: string; target?: string } | undefined
    if (!isObj(v) || !v.target || !isFileRank(v.target)) return err('goal "answer" needs verify: { method, target }')
    if (!['move', 'capture', 'block', 'defend', 'any'].includes(String(v.method))) return err('verify.method must be move, capture, block, defend or any')
    if (!start.get(v.target as never)) return err(`verify target ${v.target} is empty`)
    if (isSafe(start, v.target)) err(`the piece on ${v.target} is not in danger in this position, so there is nothing to answer`)
    const good = answersByMethod(start, v.target, v.method as 'any')
    if (!good.length) err(`no legal move answers the attack on ${v.target} by "${v.method}"`)
    else console.log(`  · ${where}: ${good.length} accepted answer(s) by "${v.method}": ${good.join(' ')}`)
    if (c.solution !== undefined || c.accept !== undefined) err('goal "answer" does not use "solution" or "accept"')
  } else {
    const line = c.solution
    if (!Array.isArray(line) || line.length % 2 === 0) err('"solution" must list moves alternating yours, reply, yours... so it needs an odd number of moves')
    playLine(fen, line, 'solution')
  }

  const accept = (c.accept ?? []) as unknown[]
  if (accept.length) {
    if (goal !== 'san') err('"accept" only makes sense with the default goal')
    else if ((c.solution as unknown[] | undefined)?.length !== 1) err('"accept" can only be used when the solution is a single move')
    for (const a of accept) {
      try {
        const m = new Chess(fen).move(String(a))
        if (m.san !== a) err(`accepted move "${String(a)}" should be written "${m.san}"`)
      } catch {
        err(`accepted move "${String(a)}" is not legal`)
      }
    }
  }

  if (isObj(c.verify) && goal === 'san') {
    if (c.verify.method === 'any') return err('verify.method "any" is only for goal "answer"')
    const v = c.verify as { method?: 'move' | 'capture' | 'block' | 'defend'; target?: string }
    onlyKeys(v as Obj, ['method', 'target'])
    if (!v.method || !v.target || !isFileRank(v.target)) return err('verify needs "method" and "target"')
    if (!start.get(v.target as never)) return err(`verify target ${v.target} is empty`)
    const all = answersByMethod(start, v.target, v.method)
    const given = [((c.solution as string[]) ?? [])[0], ...accept.map(String)].filter(Boolean)
    for (const g of given) {
      const mv = start.moves({ verbose: true }).find((m) => m.san === g)
      const got = mv ? classifyAnswer(start, v.target, mv) : null
      if (got !== v.method) err(`"${g}" is supposed to ${v.method} the attack on ${v.target}, but it ${got ? 'does ' + got : 'leaves the piece in danger'}`)
    }
    const missing = all.filter((m) => !given.includes(m))
    if (missing.length) err(`other legal moves also ${v.method} the attack on ${v.target} and would be marked wrong: add to "accept": ${missing.join(', ')}`)
  }
}

function checkSpot(c: Obj) {
  onlyKeys(c, ['type', 'prompt', 'board', 'targets', 'explain', 'verify'])
  need(c, 'prompt', 'string')
  need(c, 'explain', 'string')
  const chess = checkBoard(c.board, 'board')
  const targets = checkSquares(c.targets, 'targets')
  if (!targets.length) err('"targets" needs at least one square')
  if (!chess || !isObj(c.verify)) return
  const v = c.verify as { kind?: string; square?: string; color?: 'w' | 'b' }
  onlyKeys(v as Obj, ['kind', 'square', 'color'])
  let actual: string[] = []
  if (v.kind === 'checkers') actual = checkers(chess)
  else if (v.kind === 'attackedBy') {
    const p = v.square && chess.get(v.square as never)
    if (!p) return err('verify.square must hold a piece')
    actual = attacksOf(chess, v.square!).filter((s) => {
      const q = chess.get(s as never)
      return q && q.color !== p.color
    })
  } else if (v.kind === 'loose') {
    if (v.color !== 'w' && v.color !== 'b') return err('verify.color must be "w" or "b"')
    actual = loosePieces(chess, v.color)
  } else return err(`unknown verify kind "${String(v.kind)}"`)
  if (!sameSet(actual, targets)) err(`targets (${targets.join(' ')}) do not match what the position says (${actual.join(' ') || 'none'})`)
}

function checkPuzzleSet(c: Obj) {
  onlyKeys(c, ['type', 'title', 'theme', 'ratingMin', 'ratingMax', 'intro', 'puzzles'])
  need(c, 'title', 'string')
  need(c, 'theme', 'string')
  if (!need(c, 'puzzles', 'array')) return
  const ps = c.puzzles as Obj[]
  if (ps.length < 2 || ps.length > 6) err('a puzzle set should have 2 to 6 puzzles')
  ps.forEach((p, i) => {
    const label = `puzzle ${i + 1}`
    if (!isObj(p)) return err(`${label}: not an object`)
    onlyKeys(p, ['fen', 'solution', 'rating', 'lichessId', 'hint', 'explain'])
    if (!Array.isArray(p.solution) || p.solution.length % 2 === 0) err(`${label}: solution must alternate yours, reply, yours... (odd length)`)
    const end = playLine(p.fen as string, p.solution, label)
    muted = true // playLine already reported a bad position
    const start = loadFen(p.fen, label)
    muted = false
    if (end && start) {
      const sol = p.solution as string[]
      const last = sol[sol.length - 1] ?? ''
      if (last.endsWith('#') && !end.isCheckmate()) err(`${label}: ends with # but is not checkmate`)
      if (!last.endsWith('#') && end.isCheckmate()) err(`${label}: the last move is checkmate but is written without #`)
      const first = (p.solution as string[])[0]
      if (first?.endsWith('#')) {
        const mates = matingMoves(start)
        if (mates.length > 1) console.log(`  · ${where} ${label}: ${mates.length} mating moves (${mates.join(', ')}); all are accepted`)
      }
    }
  })
}

function checkRead(c: Obj) {
  onlyKeys(c, ['type', 'title', 'body', 'board'])
  need(c, 'title', 'string')
  if (!(isStr(c.body) || (Array.isArray(c.body) && c.body.length && c.body.every(isStr)))) err('"body" must be text or a list of paragraphs')
  const text = Array.isArray(c.body) ? c.body.join(' ') : String(c.body ?? '')
  if (text.split(/\s+/).length > 90) warn(`this read card is ${text.split(/\s+/).length} words. Cards over about 90 words feel like homework; split it or add a question`)
  if (c.board !== undefined) checkBoard(c.board, 'board')
}

function checkCard(card: unknown, area: string, i: number) {
  where = `${area}[${i + 1}]`
  if (!isObj(card)) return err('card must be an object')
  where = `${area}[${i + 1}] (${String(card.type)})`
  switch (card.type) {
    case 'read':
      return checkRead(card)
    case 'choice':
      return checkChoice(card)
    case 'findMove':
      return checkFindMove(card)
    case 'spot':
      return checkSpot(card)
    case 'puzzleSet':
      return checkPuzzleSet(card)
    default:
      err(`unknown card type "${String(card.type)}" (use read, choice, findMove, spot or puzzleSet)`)
  }
}

// ---- run -------------------------------------------------------------------------------------

const index = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8')) as { day: number; title: string; deeperTitle: string; level: string }[]
const config = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8')) as Obj
where = 'config.json'
if (!isStr(config.startDate) || Number.isNaN(Date.parse(config.startDate as string)) || !String(config.startDate).endsWith('+03:00')) {
  err('startDate must look like 2026-10-26T00:00:00+03:00 (midnight Kampala time)')
}
if (isStr(config.startDate) && !String(config.startDate).includes('T00:00:00')) warn('startDate is not midnight; days open at that time of day')

const files = readdirSync(ROOT).filter((f) => /^day-\d\d\.json$/.test(f)).sort()
console.log(`Checking ${files.length} day file(s)…`)
for (const f of files) {
  const day = Number(f.slice(4, 6))
  console.log(`\n${f}`)
  where = f
  let data: DayContent
  try {
    data = JSON.parse(readFileSync(join(ROOT, f), 'utf8'))
  } catch (e) {
    err(`not valid JSON: ${(e as Error).message}`)
    continue
  }
  onlyKeys(data as unknown as Obj, ['day', 'title', 'level', 'blurb', 'deeperTitle', 'core', 'deeper', 'share'])
  const entry = index.find((e) => e.day === day)
  if (!entry) err(`Day ${day} is not in index.json`)
  if (data.day !== day) err(`"day" is ${data.day} but the file name says ${day}`)
  need(data as unknown as Obj, 'blurb', 'string')
  if (entry) {
    if (data.title !== entry.title) err(`title "${data.title}" differs from index.json "${entry.title}"`)
    if (data.level !== entry.level) err(`level "${data.level}" differs from index.json "${entry.level}"`)
    if (data.deeperTitle !== entry.deeperTitle) err(`deeperTitle differs from index.json`)
  }
  if (!isObj(data.share) || !isStr(data.share.prompt)) err('share.prompt is required')
  if (!Array.isArray(data.core) || !Array.isArray(data.deeper)) {
    err('"core" and "deeper" must both be lists')
    continue
  }
  data.core.forEach((c, i) => checkCard(c, 'core', i))
  data.deeper.forEach((c, i) => checkCard(c, 'deeper', i))
  where = f
  const core = estimateMinutes(data.core as Card[])
  const deeper = estimateMinutes(data.deeper as Card[])
  const interactive = (cs: Card[]) => cs.filter((c) => c.type !== 'read').length
  console.log(`  core: ${data.core.length} cards, ~${core} min, ${interactive(data.core as Card[])} interactive | deeper: ${data.deeper.length} cards, ~${deeper} min, ${interactive(data.deeper as Card[])} interactive`)
  if (core < 11 || core > 20) warn(`Core is about ${core} minutes; the target is about 15`)
  if (deeper < 10 || deeper > 20) warn(`Go deeper is about ${deeper} minutes; the target is about 15`)
  if (interactive(data.core as Card[]) / data.core.length < 0.6) warn('Core is mostly reading; aim for at least 60% interactive cards')
}

console.log(`\n${errors ? '✗' : '✓'} ${errors} error(s), ${warnings} warning(s)`)
process.exit(errors ? 1 : 0)
