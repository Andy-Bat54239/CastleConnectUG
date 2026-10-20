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
  })

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
