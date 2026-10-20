import { createBoard } from './board'
import { h } from './dom'

/** Dev-only: all twelve pieces on one board, to judge the artwork. Not part of the production build. */
export function mountDev(root: HTMLElement): void {
  const wide = createBoard({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' })
  const mid = createBoard({ fen: 'r1bqk2r/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQkq - 0 8', highlight: ['e5', 'c5'], arrows: [['f4', 'c7']] })
  const flipped = createBoard({ fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1', flip: true })
  root.replaceChildren(h('section', { class: 'screen' }, h('h1', null, 'Pieces'), wide.el, mid.el, flipped.el))
}
