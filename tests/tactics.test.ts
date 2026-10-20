import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { alignment, forkSquares, moveGain, perpetualMoves, pinnedPieces, stalemateTrapMoves, winningMoves } from '../src/lib/tactics'

const KNIGHT_FORK = '6k1/3q1p1p/8/8/4N3/8/PPP2PPP/6K1 w - - 0 1' // Nf6+ forks king and queen
const DECOY = '6k1/pp3ppp/2q1b3/5N2/8/8/PP3P1P/6K1 w - - 0 1' // Ne7+ wins; Nd4 attacks the queen but gives no check
const PIN = '4k3/1p3ppp/2n5/1B6/3P4/8/PPP2PPP/4K3 b - - 0 1' // Bb5 pins Nc6 to Ke8
const SKEWER = '2r5/pp3ppp/8/2k5/8/8/PP3P1P/2R3K1 b - - 0 1' // Rc1 skewers Kc5 and Rc8

describe('material won by force', () => {
  it('finds the one move that wins a queen with a knight fork', () => {
    expect(winningMoves(KNIGHT_FORK, 9)).toEqual(['Nf6+'])
    expect(moveGain(KNIGHT_FORK, 'Nf6+')).toBe(9)
  })

  it('knows a fork without check can fail: the queen escapes with check', () => {
    expect(winningMoves(DECOY, 5)).toEqual(['Ne7+'])
    expect(moveGain(DECOY, 'Nd4')).toBeLessThan(3)
  })

  it('does not call it a win when the result is a dead draw', () => {
    // Nc7+ wins the rook but leaves only king and knight against king: a draw, so nothing is won
    expect(winningMoves('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 5)).toEqual([])
  })

  it('counts a pawn fork of two rooks', () => {
    expect(winningMoves('6k1/pp4pp/8/r1r5/8/2P5/PP4PP/6K1 w - - 0 1', 4)).toEqual(['b4'])
  })
})

describe('forks', () => {
  it('lists squares where a piece would attack two pieces, ignoring pawns', () => {
    // from e4 the knight could also go to g5 and hit two pawns, but only f6 is a real fork
    expect(forkSquares(new Chess(KNIGHT_FORK), 'e4')).toEqual(['f6'])
  })

  it("works for the side that is not to move (Black's knight)", () => {
    expect(forkSquares(new Chess('6k1/ppp2ppp/8/4n3/8/8/3Q1P1P/6K1 w - - 0 1'), 'e5')).toEqual(['f3'])
  })

  it('finds the rook fork square along a rank', () => {
    expect(forkSquares(new Chess('6k1/pp4pp/8/1n5n/8/5R2/PP4PP/6K1 w - - 0 1'), 'f3')).toEqual(['f5'])
  })
})

describe('pins and skewers', () => {
  it('finds a piece pinned to its king', () => {
    expect(pinnedPieces(new Chess(PIN), 'b')).toEqual(['c6'])
    expect(pinnedPieces(new Chess(PIN), 'w')).toEqual([])
  })

  it('tells a pin from a skewer by which piece is worth more', () => {
    expect(alignment(new Chess(PIN), 'b5', 'c6', 'e8')).toBe('pin') // knight in front of the king
    expect(alignment(new Chess(SKEWER), 'c1', 'c5', 'c8')).toBe('skewer') // king in front of the rook
    expect(alignment(new Chess('3q2k1/5ppp/5n2/6B1/8/8/PPP2PPP/4K3 w - - 0 1'), 'g5', 'f6', 'd8')).toBe('pin') // pinned to the queen
  })

  it('rejects lines that are blocked, wrongly shaped, or between the wrong colours', () => {
    expect(alignment(new Chess(PIN), 'b5', 'c6', 'a8')).toBeNull() // not on one line
    expect(alignment(new Chess('4k3/1p3ppp/2n5/1B6/3P4/8/PPP2PPP/4K3 b - - 0 1'), 'd4', 'c6', 'e8')).toBeNull() // a pawn does not pin
    expect(alignment(new Chess('4k3/1p1p1ppp/2n5/1B6/3P4/8/PPP2PPP/4K3 b - - 0 1'), 'b5', 'c6', 'e8')).toBeNull() // d7 pawn blocks the line
  })
})

describe('draw resources', () => {
  it('finds the one perpetual check', () => {
    expect(perpetualMoves(new Chess('r5k1/p1p5/4N3/8/8/3Q4/q7/7K w - - 0 1'))).toEqual(['Qg6+'])
  })
  it('finds no perpetual where the opponent can escape the checks', () => {
    expect(perpetualMoves(new Chess('6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1'))).toEqual([])
  })
  it('finds the stalemate trap', () => {
    expect(stalemateTrapMoves(new Chess('k3r3/8/1Q6/8/8/2B5/5PPP/7K b - - 0 1'))).toEqual(['Re1+'])
  })
  it('does not call a move a trap when the opponent has a choice', () => {
    expect(stalemateTrapMoves(new Chess('k3r3/8/1Q6/8/8/2B5/6PP/7K b - - 0 1'))).toEqual([])
  })
})
