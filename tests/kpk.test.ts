import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { kpkKeepingMoves, kpkKeySquares, kpkResult, kpkWonCount } from '../src/lib/kpk'

const result = (fen: string) => kpkResult(new Chess(fen))

describe('king and pawn against king', () => {
  it('solves the table (the same counts as an independent rebuild with chess.js)', () => {
    expect(kpkWonCount()).toEqual({ whiteToMove: 124960, blackToMove: 97604 })
  }, 60_000)

  it('knows the king on a key square wins whoever moves', () => {
    expect(result('4k3/8/4K3/4P3/8/8/8/8 w - - 0 1')).toBe('win')
    expect(result('4k3/8/4K3/4P3/8/8/8/8 b - - 0 1')).toBe('win')
  })

  it('knows the opposition: the side that does not have to move wins', () => {
    // White Ke5, pawn e4 against Ke7: a win if Black is to move, a draw if White is
    expect(result('8/4k3/8/4K3/4P3/8/8/8 b - - 0 1')).toBe('win')
    expect(result('8/4k3/8/4K3/4P3/8/8/8 w - - 0 1')).toBe('draw')
  })

  it('knows a rook pawn draws against a king in the corner', () => {
    expect(result('k7/8/1K6/P7/8/8/8/8 b - - 0 1')).toBe('draw')
    expect(result('k7/8/1K6/P7/8/8/8/8 w - - 0 1')).toBe('draw')
  })

  it('knows the rule of the square, with the move taken into account', () => {
    // pawn on c4, White king far away, Black to move: a king on g6 can step into the square, a king on h6 cannot
    expect(result('8/8/6k1/8/2P5/8/8/K7 b - - 0 1')).toBe('draw')
    expect(result('8/8/7k/8/2P5/8/8/K7 b - - 0 1')).toBe('win')
  })

  it('finds the one move that keeps the win, or the draw', () => {
    expect(kpkKeepingMoves(new Chess('8/4k3/8/3K4/4P3/8/8/8 w - - 0 1'))).toEqual(['Ke5']) // take the opposition
    expect(kpkKeepingMoves(new Chess('8/8/5k2/3K4/4P3/8/8/8 w - - 0 1'))).toEqual(['Kd6']) // reach a key square
    expect(kpkKeepingMoves(new Chess('8/2k5/8/2K1P3/8/8/8/8 b - - 0 1'))).toEqual(['Kd7']) // the only drawing move
  })

  it('works for a Black pawn too, by turning the board over', () => {
    // mirror of White Ke6, pawn e5 against Ke8: Black Ke3, pawn e4 against Ke1 wins for Black either way
    expect(result('8/8/8/8/4p3/4k3/8/4K3 b - - 0 1')).toBe('win')
    expect(result('8/8/8/8/4p3/4k3/8/4K3 w - - 0 1')).toBe('win')
  })

  it('finds the key squares: three squares in front of a pawn on the fifth rank', () => {
    expect(kpkKeySquares('e5' as never).sort()).toEqual(['d6', 'e6', 'f6'])
    expect(kpkKeySquares('d5' as never).sort()).toEqual(['c6', 'd6', 'e6'])
    expect(kpkKeySquares('e6' as never).sort()).toEqual(['d7', 'e7', 'f7'])
  })

  it('returns null when it is not king and pawn against king', () => {
    expect(result('4k3/8/8/8/8/8/4P3/4K1N1 w - - 0 1')).toBeNull()
    expect(result('8/8/8/8/8/8/8/K1k5 w - - 0 1')).toBeNull()
  })
})
