/**
 * Authoring helper: play a list of moves from the start and print the FEN after each.
 *   npm run line -- "e4 e5 Nf3 Nc6 Bc4"
 * Start from another position with --fen "<fen>" before the moves.
 */
import { Chess } from 'chess.js'

const args = process.argv.slice(2)
let fen: string | undefined
if (args[0] === '--fen') {
  fen = args[1]
  args.splice(0, 2)
}
const moves = (args.join(' ') || '').split(/\s+/).filter((m) => m && !/^\d+\.+$/.test(m))
const c = fen ? new Chess(fen) : new Chess()
console.log('start:', c.fen())
for (const m of moves) {
  const mv = c.move(m)
  console.log(`${mv.san.padEnd(7)} ${c.fen()}${c.isCheckmate() ? '   CHECKMATE' : c.isStalemate() ? '   STALEMATE' : ''}`)
}
