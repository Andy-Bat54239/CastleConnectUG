import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * The validator is the safety net that keeps wrong chess off the site, so these tests feed it
 * deliberately broken lessons and check that each one is rejected with a useful message.
 */
const root = join(__dirname, '..')
const dirs: string[] = []

function run(contentDir: string): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, ['--import', 'tsx', join(root, 'scripts/validate-content.ts')], {
      env: { ...process.env, BG_CONTENT_DIR: contentDir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: err.stdout + err.stderr }
  }
}

function dayWith(core: unknown[], extra: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'bg-content-'))
  dirs.push(dir)
  copyFileSync(join(root, 'content/config.json'), join(dir, 'config.json'))
  copyFileSync(join(root, 'content/index.json'), join(dir, 'index.json'))
  const day = {
    day: 1,
    title: 'How games end',
    level: '0-600',
    blurb: 'Test day.',
    deeperTitle: "Back-rank mate and luft; the Scholar's Mate trap",
    share: { prompt: 'One thing…' },
    core,
    deeper: [],
    ...extra,
  }
  writeFileSync(join(dir, 'day-01.json'), JSON.stringify(day))
  return dir
}

const MATE_FEN = '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1' // Qg7# is the only mate

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('content validator', () => {
  it('accepts all the real lessons in /content', () => {
    const r = run(join(root, 'content'))
    expect(r.out).toContain('0 error(s)')
    expect(r.code).toBe(0)
  }, 120_000) // proves every mate and tactic in every day, so it grows with each day written

  it('accepts a correct card', () => {
    const r = run(dayWith([{ type: 'findMove', prompt: 'Mate.', fen: MATE_FEN, goal: 'mate', explain: 'x' }]))
    expect(r.code).toBe(0)
  })

  it('rejects an illegal position (side that just moved is in check)', () => {
    const r = run(dayWith([{ type: 'findMove', prompt: 'x', fen: '4k3/4R3/8/8/8/8/8/4K3 w - - 0 1', solution: ['Ra7'], explain: 'x' }]))
    expect(r.code).toBe(1)
    expect(r.out).toContain('cannot happen in a real game')
  })

  it('rejects a move that is not legal', () => {
    const r = run(dayWith([{ type: 'findMove', prompt: 'x', fen: MATE_FEN, solution: ['Qg9'], explain: 'x' }]))
    expect(r.code).toBe(1)
  })

  it('rejects a mate claim that is not mate', () => {
    // Qg6 is stalemate here, not checkmate
    const r = run(dayWith([{ type: 'findMove', prompt: 'x', fen: MATE_FEN, solution: ['Qg6#'], explain: 'x' }]))
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/Qg6|written/)
  })

  it('rejects a "mate" goal in a position with no mate', () => {
    const r = run(dayWith([{ type: 'findMove', prompt: 'x', fen: '4k3/8/8/8/8/8/8/4K2R w - - 0 1', goal: 'mate', explain: 'x' }]))
    expect(r.code).toBe(1)
    expect(r.out).toContain('no checkmate in one')
  })

  it('rejects a board that is called checkmate when it is not', () => {
    const r = run(dayWith([{ type: 'read', title: 't', body: 'b', board: { fen: MATE_FEN, assert: { status: 'checkmate' } } }]))
    expect(r.code).toBe(1)
    expect(r.out).toContain('says this position is checkmate')
  })

  it('rejects a wrong "loose piece" answer', () => {
    const board = { fen: '6k1/3p1ppp/2n5/5b2/8/8/2Q2PPP/6K1 w - - 0 1' }
    const r = run(dayWith([{ type: 'spot', prompt: 'x', board, targets: ['c6'], explain: 'x', verify: { kind: 'loose', color: 'b' } }]))
    expect(r.code).toBe(1)
    expect(r.out).toContain('do not match')
  })

  it('rejects an "answer" card where the piece is not actually in danger', () => {
    const r = run(
      dayWith([{ type: 'findMove', prompt: 'x', fen: '6k1/5ppp/8/8/6b1/5N2/5PP1/6K1 w - - 0 1', goal: 'answer', verify: { method: 'any', target: 'f3' }, explain: 'x' }]),
    )
    expect(r.code).toBe(1)
    expect(r.out).toContain('not in danger')
  })

  it('rejects a mating line the opponent can dodge', () => {
    const good = { fen: 'k7/7R/8/8/8/8/8/2R3K1 w - - 0 1', solution: ['Rc8#'] }
    // Black's king on d7 can answer Rb7+ with Kc8, so this is NOT a forced mate in two.
    const dodgeable = { fen: '8/3k4/R7/8/8/8/8/1R5K w - - 0 1', solution: ['Rb7+', 'Ke8', 'Ra8#'] }
    const r = run(dayWith([{ type: 'puzzleSet', title: 'x', theme: 'x', puzzles: [good, dodgeable] }]))
    expect(r.code).toBe(1)
    expect(r.out).toContain('not a forced mate')
  })

  it('accepts a genuinely forced two-move mate', () => {
    const good = { fen: '8/4k3/R7/8/8/8/8/1R5K w - - 0 1', solution: ['Rb7+', 'Kd8', 'Ra8#'] }
    const easy = { fen: 'k7/7R/8/8/8/8/8/2R3K1 w - - 0 1', solution: ['Rc8#'] }
    expect(run(dayWith([{ type: 'puzzleSet', title: 'x', theme: 'x', puzzles: [good, easy] }])).code).toBe(0)
  })

  it('checks the squares a tap-the-square card says a piece can go to', () => {
    const board = { fen: '8/1R2k3/R7/8/8/8/8/7K b - - 1 1' }
    const ok = dayWith([{ type: 'spot', prompt: 'x', board, targets: ['d8', 'e8', 'f8'], explain: 'x', verify: { kind: 'legalMoves', square: 'e7' } }])
    expect(run(ok).code).toBe(0)
    const wrong = dayWith([{ type: 'spot', prompt: 'x', board, targets: ['d8', 'e8'], explain: 'x', verify: { kind: 'legalMoves', square: 'e7' } }])
    const r = run(wrong)
    expect(r.code).toBe(1)
    expect(r.out).toContain('do not match')
  })

  it('rejects a "wins" claim the search cannot prove', () => {
    const card = { type: 'findMove', prompt: 'x', fen: '6k1/3q1p1p/8/8/4N3/8/PPP2PPP/6K1 w - - 0 1', solution: ['Nf6+'], explain: 'x' }
    expect(run(dayWith([{ ...card, wins: 9 }])).code).toBe(0)
    const r = run(dayWith([{ ...card, wins: 20 }]))
    expect(r.code).toBe(1)
    expect(r.out).toContain('supposed to win 20 points')
  })

  it('rejects a "wins" claim when other moves win just as much', () => {
    // the pinned knight hangs, so almost every move wins it: the lesson cannot claim one special move
    const r = run(dayWith([{ type: 'findMove', prompt: 'x', fen: '4k3/5ppp/2n5/1B6/3P4/8/PPP2PPP/4K3 w - - 0 1', solution: ['d5'], wins: 3, explain: 'x' }]))
    expect(r.code).toBe(1)
    expect(r.out).toContain('other moves also win')
  })

  it('checks a fork claim: the moved piece must really attack both targets', () => {
    const base = { type: 'findMove', prompt: 'x', fen: '6k1/3q1p1p/8/8/4N3/8/PPP2PPP/6K1 w - - 0 1', solution: ['Nf6+'], explain: 'x' }
    expect(run(dayWith([{ ...base, after: { attackedFrom: { f6: ['g8', 'd7'] } } }])).code).toBe(0)
    const r = run(dayWith([{ ...base, after: { attackedFrom: { f6: ['g8', 'a1'] } } }]))
    expect(r.code).toBe(1)
    expect(r.out).toContain('does not attack a1')
  })

  it('checks pin and skewer claims', () => {
    const board = (kind: string) => ({ fen: '4k3/1p3ppp/2n5/1B6/3P4/8/PPP2PPP/4K3 b - - 0 1', assert: { lines: [{ kind, attacker: 'b5', front: 'c6', back: 'e8' }] } })
    expect(run(dayWith([{ type: 'read', title: 't', body: 'b', board: board('pin') }])).code).toBe(0)
    const r = run(dayWith([{ type: 'read', title: 't', body: 'b', board: board('skewer') }]))
    expect(r.code).toBe(1)
    expect(r.out).toContain('is a pin, not a skewer')
  })

  it('checks fork-square and pinned-piece tap cards', () => {
    const forkBoard = { fen: '6k1/pp4pp/8/1n5n/8/5R2/PP4PP/6K1 w - - 0 1' }
    const ok = dayWith([{ type: 'spot', prompt: 'x', board: forkBoard, targets: ['f5'], explain: 'x', verify: { kind: 'forkSquares', square: 'f3' } }])
    expect(run(ok).code).toBe(0)
    const bad = run(dayWith([{ type: 'spot', prompt: 'x', board: forkBoard, targets: ['f6'], explain: 'x', verify: { kind: 'forkSquares', square: 'f3' } }]))
    expect(bad.code).toBe(1)
    const pinBoard = { fen: '4k3/1p3ppp/2n5/1B6/3P4/8/PPP2PPP/4K3 b - - 0 1' }
    expect(run(dayWith([{ type: 'spot', prompt: 'x', board: pinBoard, targets: ['c6'], explain: 'x', verify: { kind: 'pinned', color: 'b' } }])).code).toBe(0)
    expect(run(dayWith([{ type: 'spot', prompt: 'x', board: pinBoard, targets: ['f7'], explain: 'x', verify: { kind: 'pinned', color: 'b' } }])).code).toBe(1)
  })

  it('checks tap-a-check cards', () => {
    const board = { fen: 'r5k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1' }
    const spot = (targets: string[]) => dayWith([{ type: 'spot', prompt: 'x', board, targets, explain: 'x', verify: { kind: 'checkSquares', square: 'd1' } }])
    expect(run(spot(['d8'])).code).toBe(0)
    expect(run(spot(['d7'])).code).toBe(1)
    // the piece may belong to the side that is NOT to move ("what would they do?"); mate squares are checked too
    const theirs = { fen: '6k1/5ppp/8/8/8/8/5PPP/r3R1K1 w - - 0 1' }
    const mateCard = (targets: string[], kind = 'mateSquares') => dayWith([{ type: 'spot', prompt: 'x', board: theirs, targets, explain: 'x', verify: { kind, square: 'a1' } }])
    expect(run(mateCard(['e1'])).code).toBe(0) // Black's rook would mate on e1 (back rank), though White is to move
    expect(run(mateCard(['e1'], 'checkSquares')).code).toBe(0)
    expect(run(mateCard(['b1'])).code).toBe(1)
    // a piece with no check available is an authoring mistake
    const none = dayWith([{ type: 'spot', prompt: 'x', board, targets: ['g2'], explain: 'x', verify: { kind: 'checkSquares', square: 'g2' } }])
    expect(run(none).code).toBe(1)
  })

  it('rejects an unlockAll that is not true or false', () => {
    const dir = dayWith([{ type: 'read', title: 't', body: 'b' }])
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ startDate: '2026-10-26T00:00:00+03:00', challengeName: 'x', unlockAll: 'yes' }))
    const r = run(dir)
    expect(r.code).toBe(1)
    expect(r.out).toContain('unlockAll must be true or false')
  })

  it('catches a mistyped field name', () => {
    const r = run(dayWith([{ type: 'findMove', prompt: 'x', fen: MATE_FEN, solutoin: ['Qg7#'], goal: 'mate', explain: 'x' }]))
    expect(r.code).toBe(1)
    expect(r.out).toContain('unknown field "solutoin"')
  })

  it('catches a multiple-choice answer that points at nothing', () => {
    const r = run(dayWith([{ type: 'choice', prompt: 'x', options: ['a', 'b'], answer: 2, explain: 'x' }]))
    expect(r.code).toBe(1)
  })

  it('catches a day whose title drifts from index.json', () => {
    const r = run(dayWith([{ type: 'read', title: 't', body: 'b' }], { title: 'Something else' }))
    expect(r.code).toBe(1)
    expect(r.out).toContain('differs from index.json')
  })
})
