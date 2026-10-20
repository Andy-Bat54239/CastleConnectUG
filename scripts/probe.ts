/**
 * Authoring helper: print the chess facts about a position.
 *   npm run probe -- "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1"
 * Add a square to see what the piece there attacks and defends:  npm run probe -- "<fen>" d1
 * Add --mate 2 to list every first move that forces checkmate within 2 moves (try 1 to 3).
 */
import { Chess } from 'chess.js'
import { attacksOf, attackersOf, checkers, defendersOf, forcedMateMoves, loosePieces, mateAvoidingMoves, matingMoves } from '../src/lib/chessUtil'
import { hangingPieces } from '../src/lib/verify'

const argv = process.argv.slice(2)
const mateAt = argv.indexOf('--mate')
const mateN = mateAt >= 0 ? Number(argv.splice(mateAt, 2)[1]) : 0
const [fen, square] = argv
if (!fen) {
  console.log('usage: npm run probe -- "<fen>" [square]')
  process.exit(1)
}
const c = new Chess(fen)
const side = c.turn() === 'w' ? 'White' : 'Black'
console.log(`${side} to move${c.isCheckmate() ? ' (CHECKMATE)' : c.isStalemate() ? ' (STALEMATE)' : c.isCheck() ? ' (in check)' : ''}`)
console.log(c.ascii())
console.log('legal moves   :', c.moves().join(' ') || 'none')
console.log('mating moves  :', matingMoves(c).join(' ') || 'none')
console.log('stops mate-in-1:', mateAvoidingMoves(c).join(' ') || 'none')
if (mateN) console.log(`forces mate in ${mateN}:`, forcedMateMoves(c, mateN).join(' ') || 'none')
console.log('giving check  :', checkers(c).join(' ') || 'none')
console.log('loose white   :', loosePieces(c, 'w').join(' ') || 'none')
console.log('loose black   :', loosePieces(c, 'b').join(' ') || 'none')
console.log('hanging white :', hangingPieces(c, 'w').join(' ') || 'none')
console.log('hanging black :', hangingPieces(c, 'b').join(' ') || 'none')
if (square) {
  console.log(`${square} attacks    :`, attacksOf(c, square).join(' ') || 'nothing')
  console.log(`${square} attacked by:`, attackersOf(c, square).join(' ') || 'nothing')
  console.log(`${square} defended by:`, defendersOf(c, square).join(' ') || 'nothing')
}
