import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { checkers, hasMateInOne, loosePieces, mateAvoidingMoves, matingMoves, attacksOf, stripSan } from '../src/lib/chessUtil'
import { answersByMethod, classifyAnswer, isSafe } from '../src/lib/verify'
import { indexOf, placement, turnOf } from '../src/lib/fen'

describe('fen helpers', () => {
  it('reads piece placement a8 first', () => {
    const p = placement('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    expect(p).toHaveLength(64)
    expect(p[0]).toBe('r')
    expect(p[63]).toBe('R')
    expect(p[indexOf('e4')]).toBeNull()
    expect(p[indexOf('e1')]).toBe('K')
  })
  it('reads whose turn it is', () => {
    expect(turnOf('8/8/8/8/8/8/8/k6K b - - 0 1')).toBe('b')
  })
  it('strips check marks for comparing moves', () => {
    expect(stripSan('Qxf7#')).toBe('Qxf7')
    expect(stripSan('Bxf7+')).toBe('Bxf7')
  })
})

describe('chess facts', () => {
  it('finds checkmates in one', () => {
    const c = new Chess('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1')
    expect(matingMoves(c)).toEqual(['Qg7#'])
    expect(hasMateInOne(c)).toBe(true)
  })
  it('finds the moves that stop a back-rank mate', () => {
    const c = new Chess('6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1')
    const safe = mateAvoidingMoves(c)
    expect(safe).toContain('h6')
    expect(safe).toContain('Kf8')
    expect(safe).not.toContain('Kh8')
  })
  it('counts attacked squares', () => {
    expect(attacksOf(new Chess('k7/8/8/8/3B4/8/8/7K w - - 0 1'), 'd4')).toHaveLength(13)
    expect(attacksOf(new Chess('k7/8/8/8/4N3/8/8/7K w - - 0 1'), 'e4')).toHaveLength(8)
    expect(attacksOf(new Chess('k7/8/8/8/3R4/8/8/7K w - - 0 1'), 'd4')).toHaveLength(14)
  })
  it('lists loose pieces and checkers', () => {
    expect(loosePieces(new Chess('6k1/3p1ppp/2n5/5b2/8/8/2Q2PPP/6K1 w - - 0 1'), 'b')).toEqual(['f5'])
    expect(checkers(new Chess('rnbqkbnr/ppppp1pp/5p2/7Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2'))).toEqual(['h5'])
  })
})

describe('answering an attack', () => {
  it('knows a queen attacked by a pawn is not safe, even when defended', () => {
    const c = new Chess('6k1/5ppp/3p4/4p3/3Q4/8/5PPP/6K1 w - - 0 1')
    expect(isSafe(c, 'd4')).toBe(false)
  })
  it('classifies moving, and refuses a queen capture that loses her', () => {
    const c = new Chess('6k1/5ppp/3p4/4p3/3Q4/8/5PPP/6K1 w - - 0 1')
    const moves = c.moves({ verbose: true })
    const by = (san: string) => classifyAnswer(c, 'd4', moves.find((m) => m.san === san)!)
    expect(by('Qd1')).toBe('move')
    expect(by('Qxd6')).toBe('move')
    expect(by('Qxe5')).toBeNull() // the d6 pawn recaptures
    expect(by('Qc5')).toBeNull() // the d6 pawn attacks c5
    expect(by('h3')).toBeNull()
  })
  it('classifies a block and rejects other answers', () => {
    const c = new Chess('4rrk1/5ppp/8/8/8/8/3BQPPP/6K1 w - - 0 1')
    expect(answersByMethod(c, 'e2', 'block')).toEqual(['Be3'])
    expect(answersByMethod(c, 'e2', 'capture')).toEqual([]) // Qxe8+ loses the queen to Rxe8
  })
  it('classifies capturing the attacker', () => {
    const c = new Chess('6k1/5ppp/8/8/6b1/5NPP/5P2/6K1 w - - 0 1')
    expect(answersByMethod(c, 'f3', 'capture')).toEqual(['hxg4'])
  })
  it('classifies defending a pawn that a bishop attacks', () => {
    const c = new Chess('6k1/5ppp/2b5/8/4P3/8/5PPP/1N3RK1 w - - 0 1')
    expect(answersByMethod(c, 'e4', 'defend').sort()).toEqual(['Nc3', 'Nd2', 'Re1', 'f3'].sort())
    expect(answersByMethod(c, 'e4', 'move')).toEqual(['e5'])
  })
  it('does not count an equal trade as losing material', () => {
    // knight attacked by a bishop, but defended by a pawn: trading 3 for 3 is fine
    const c = new Chess('6k1/5ppp/8/8/6b1/5N2/5PP1/6K1 w - - 0 1')
    expect(isSafe(c, 'f3')).toBe(true)
  })
})
