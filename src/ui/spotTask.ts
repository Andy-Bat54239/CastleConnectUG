import type { BoardSpec, Square } from '../types'
import type { CardResult } from '../lib/store'
import { createBoard } from './board'
import { button, h, rich } from './dom'

export interface SpotTaskOptions {
  spec: BoardSpec
  targets: Square[]
  prior?: CardResult
  onDone: (res: CardResult) => void
}

const MAX_FREE_TRIES = 2

/** "Tap the square or piece" task. Any square in `targets` is correct. */
export function createSpotTask(o: SpotTaskOptions): HTMLElement {
  const board = createBoard({
    fen: o.spec.fen,
    flip: o.spec.flip ?? false,
    highlight: o.spec.highlight,
    arrows: o.spec.arrows,
    interactive: true,
  })
  const status = h('p', { class: 'task-status', role: 'status', 'aria-live': 'polite' })
  const actions = h('div', { class: 'task-actions' })
  const el = h('div', { class: 'task' }, board.el, status, actions)
  let tries = 0
  let finished = false

  const say = (t: string, cls = '') => {
    status.className = 'task-status ' + cls
    status.replaceChildren(rich(t))
  }

  function finish(shown: boolean): void {
    finished = true
    board.setInteractive(false)
    actions.replaceChildren()
    o.onDone({ done: true, first: !shown && tries === 0, tries, shown: shown || undefined })
  }

  board.onSquare = (sq) => {
    if (finished) return
    if (o.targets.includes(sq)) {
      board.mark(sq, 'good')
      say('Yes, that is it.', 'ok')
      finish(false)
      return
    }
    tries++
    board.flash(sq, 'bad')
    say('Not that one. Have another look.', 'bad')
    if (tries >= MAX_FREE_TRIES && !actions.firstChild) {
      actions.append(
        button('Show me', 'btn ghost sm', () => {
          for (const t of o.targets) board.mark(t, 'good')
          say('It was the highlighted square.', 'info')
          finish(true)
        }),
      )
    }
  }

  if (o.prior?.done) {
    finished = true
    board.setInteractive(false)
    for (const t of o.targets) board.mark(t, 'good')
    say(o.prior.shown ? 'You looked at the answer for this one.' : 'Solved.', o.prior.shown ? 'info' : 'ok')
  } else {
    say('Tap the board.')
  }
  return el
}
