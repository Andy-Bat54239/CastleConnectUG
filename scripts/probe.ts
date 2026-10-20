/**
 * Authoring helper: print the chess facts about a position.
 *   npm run probe -- "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1"
 * Add a square to see what the piece there attacks and defends:  npm run probe -- "<fen>" d1
 * Add --mate 2 to list every first move that forces checkmate within 2 moves (try 1 to 3).
 * Add --wins 3 to list every first move that wins at least 3 points of material by force.
 * With a square, also lists where that piece could move to fork two enemy pieces.
 */
import { Chess } from 'chess.js'
import { attacksOf, attackersOf, checkers, defendersOf, forcedMateMoves, loosePieces, mateAvoidingMoves, matingMoves } from '../src/lib/chessUtil'
import { hangingPieces } from '../src/lib/verify'
import { kpkKeepingMoves, kpkResult } from '../src/lib/kpk'
import { alignment, backwardPawns, badBishops, bishopPawnCounts, developedPieces, doubledPawns, forkSquares, isolatedPawns, outpostSquares, passedPawns, materialDiff, mobility, openFiles, pinnedPieces, spaceCount, winningMoves } from '../src/lib/tactics'

const argv = process.argv.slice(2)
const winsAt = argv.indexOf('--wins')
const winsN = winsAt >= 0 ? Number(argv.splice(winsAt, 2)[1]) : 0
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
if (winsN) console.log(`wins >= ${winsN} pts :`, winningMoves(fen, winsN).join(' ') || 'none')
if (mateN) console.log(`forces mate in ${mateN}:`, forcedMateMoves(c, mateN).join(' ') || 'none')
console.log('pinned white  :', pinnedPieces(c, 'w').join(' ') || 'none', '| pinned black:', pinnedPieces(c, 'b').join(' ') || 'none')
console.log('giving check  :', checkers(c).join(' ') || 'none')
console.log('loose white   :', loosePieces(c, 'w').join(' ') || 'none')
console.log('loose black   :', loosePieces(c, 'b').join(' ') || 'none')
console.log('hanging white :', hangingPieces(c, 'w').join(' ') || 'none')
console.log('hanging black :', hangingPieces(c, 'b').join(' ') || 'none')
console.log('doubled pawns : white', doubledPawns(c, 'w').join(' ') || 'none', '| black', doubledPawns(c, 'b').join(' ') || 'none')
console.log('backward pawns: white', backwardPawns(c, 'w').join(' ') || 'none', '| black', backwardPawns(c, 'b').join(' ') || 'none')
console.log('passed pawns : white', passedPawns(c, 'w').join(' ') || 'none', '| black', passedPawns(c, 'b').join(' ') || 'none')
const bishopLine = c
  .board()
  .flat()
  .filter((p) => p && p.type === 'b')
  .map((p) => {
    const n = bishopPawnCounts(c, p!.square)
    return `${p!.color === 'w' ? 'White' : 'Black'} ${p!.square}: ${n?.same} own pawns on its colour, ${n?.other} on the other${badBishops(c, p!.color).includes(p!.square) ? ' (bad)' : ''}`
  })
  .join(' | ')
if (bishopLine) console.log('bishops      :', bishopLine)
console.log('outposts     : white', outpostSquares(c, 'w').join(' ') || 'none', '| black', outpostSquares(c, 'b').join(' ') || 'none')
console.log('isolated pawns: white', isolatedPawns(c, 'w').join(' ') || 'none', '| black', isolatedPawns(c, 'b').join(' ') || 'none')
console.log('material (white minus black):', materialDiff(c), '| developed knights and bishops: white', developedPieces(c, 'w'), '| black', developedPieces(c, 'b'))
{
  const kr = kpkResult(c)
  if (kr) console.log('king and pawn ending:', kr, '| moves that keep it:', (kpkKeepingMoves(c) ?? []).join(' ') || 'none')
}
console.log('open files    :', openFiles(c).join(' ') || 'none', '| space (squares attacked on their half): white', spaceCount(c, 'w'), '| black', spaceCount(c, 'b'), '| legal moves: white', mobility(c, 'w'), '| black', mobility(c, 'b'))
if (square) {
  console.log(`${square} attacks    :`, attacksOf(c, square).join(' ') || 'nothing')
  console.log(`${square} attacked by:`, attackersOf(c, square).join(' ') || 'nothing')
  console.log(`${square} defended by:`, defendersOf(c, square).join(' ') || 'nothing')
  console.log(`${square} fork squares:`, (forkSquares(c, square) ?? []).join(' ') || 'none')
  const lineups: string[] = []
  const all = new Chess(fen)
  for (const f of 'abcdefgh') for (const r of '12345678') for (const g of 'abcdefgh') for (const h of '12345678') {
    const fr = f + r, bk = g + h
    if (fr === square || bk === square || fr === bk) continue
    const k = alignment(all, square, fr, bk)
    if (k) lineups.push(`${k}: ${square}>${fr}>${bk}`)
  }
  console.log(`${square} pins/skewers:`, lineups.join('  ') || 'none')
}
