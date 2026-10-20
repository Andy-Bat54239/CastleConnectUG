import { Chess } from 'chess.js'
import type { Square } from '../types'
import type { CardResult } from '../lib/store'
import { hasMateInOne, matingMoves, mateAvoidingMoves, sideName, stripSan } from '../lib/chessUtil'
import { answersByMethod, classifyAnswer, type AnswerMethod, type AnswerWanted } from '../lib/verify'
import { createBoard, type Board } from './board'
import { button, h, rich } from './dom'

export interface MoveTaskOptions {
  fen: string
  goal: 'san' | 'mate' | 'avoidMate' | 'answer'
  /** For goal "answer": the attacked piece and the kind of answer wanted. */
  answer?: { target: Square; method: AnswerWanted }
  /** SAN moves alternating: yours, the reply, yours... */
  solution: string[]
  /** Alternative first moves (only meaningful when `solution` has a single move). */
  accept: string[]
  hint?: string
  highlight?: Square[]
  arrows?: [Square, Square][]
  /** Result saved earlier: show the task already solved. */
  prior?: CardResult
  onDone: (res: CardResult) => void
}

export interface MoveTask {
  el: HTMLElement
  board: Board
}

const MAX_FREE_TRIES = 2

export function createMoveTask(o: MoveTaskOptions): MoveTask {
  const chess = new Chess(o.fen)
  const turn = chess.turn()
  const board = createBoard({ fen: o.fen, flip: turn === 'b', highlight: o.highlight, arrows: o.arrows, interactive: true })
  const status = h('p', { class: 'task-status', role: 'status', 'aria-live': 'polite' })
  const actions = h('div', { class: 'task-actions' })
  const el = h('div', { class: 'task' }, board.el, status, actions)

  let step = 0 // index into solution of the move the member must play next
  let tries = 0
  let busy = false
  let finished = false
  let selected: Square | null = null

  const saySide = () => `${sideName(turn)} to move. Drag a piece, or tap it and then tap where it goes.`
  const say = (t: string, cls = '') => {
    status.className = 'task-status ' + cls
    status.replaceChildren(rich(t))
  }

  function finish(shown: boolean): void {
    finished = true
    board.setSelected(null)
    board.setInteractive(false)
    actions.replaceChildren()
    const res: CardResult = { done: true, first: !shown && tries === 0, tries, shown: shown || undefined }
    o.onDone(res)
  }

  function legalTargets(sq: Square): Square[] {
    return chess.moves({ square: sq as never, verbose: true }).map((m) => m.to as Square)
  }

  function isCorrect(userSan: string, how: AnswerMethod | null): boolean {
    if (o.goal === 'answer') return how !== null && (o.answer?.method === 'any' || how === o.answer?.method)
    if (o.goal === 'mate') return chess.isCheckmate()
    if (o.goal === 'avoidMate') return !hasMateInOne(chess)
    const want = o.solution[step]
    if (!want) return false
    if (stripSan(userSan) === stripSan(want)) return true
    // When the stored answer is checkmate, any other move that also mates is just as right.
    if (want.endsWith('#') && chess.isCheckmate()) return true
    return step === 0 && o.solution.length === 1 && o.accept.some((a) => stripSan(a) === stripSan(userSan))
  }

  function offerHelp(): void {
    actions.replaceChildren()
    if (o.hint && tries >= 1) {
      const hint = button('Hint', 'btn ghost sm', () => {
        say('**Hint:** ' + o.hint)
        hint.remove()
      })
      actions.append(hint)
    }
    if (tries >= MAX_FREE_TRIES) actions.append(button('Show me', 'btn ghost sm', reveal))
  }

  /** Reveal the answer after missed tries: play the move so the member sees it. */
  function reveal(): void {
    if (finished || busy) return
    let san = o.solution[step]
    if (o.goal === 'mate') san = matingMoves(chess)[0]
    else if (o.goal === 'avoidMate') san = mateAvoidingMoves(chess)[0]
    else if (o.goal === 'answer' && o.answer) san = answersByMethod(chess, o.answer.target, o.answer.method)[0]
    if (!san) return
    const mv = chess.move(san)
    board.setFen(chess.fen())
    board.setLastMove(mv.from as Square, mv.to as Square)
    board.setArrows([[mv.from as Square, mv.to as Square]])
    board.mark(mv.to as Square, 'good')
    say(`The answer was **${mv.san}**.`, 'info')
    finish(true)
  }

  const VERB: Record<AnswerMethod, string> = { move: 'moving it', capture: 'capturing the attacker', block: 'blocking', defend: 'defending it' }
  const ASK: Record<AnswerWanted, string> = { move: 'move it away', capture: 'capture the attacker', block: 'block the attack', defend: 'defend it', any: 'save it' }

  function attempt(from: Square, to: Square): void {
    let how: AnswerMethod | null = null
    if (o.goal === 'answer' && o.answer) {
      const legal = chess.moves({ square: from as never, verbose: true }).find((m) => m.to === to)
      if (legal) how = classifyAnswer(chess, o.answer.target, legal)
    }
    let mv
    try {
      mv = chess.move({ from, to, promotion: 'q' })
    } catch {
      return
    }
    board.setSelected(null)
    board.setFen(chess.fen())
    board.setLastMove(from, to)
    if (isCorrect(mv.san, how)) {
      board.flash(to, 'good')
      step++
      if (step >= o.solution.length || o.goal !== 'san') {
        say('Yes! **' + mv.san + '**', 'ok')
        finish(false)
        return
      }
      // The opponent answers automatically, then it is the member's turn again.
      busy = true
      say('Good move. Watch the reply…', 'ok')
      window.setTimeout(() => {
        const reply = chess.move(o.solution[step])
        step++
        board.setFen(chess.fen())
        board.setLastMove(reply.from as Square, reply.to as Square)
        busy = false
        if (step >= o.solution.length) {
          finish(false)
          return
        }
        say(`${sideName(turn)} to move again.`)
      }, 650)
      return
    }
    // Wrong: show it briefly, then take it back.
    busy = true
    tries++
    board.flash(to, 'bad')
    if (o.goal === 'answer' && o.answer) {
      say(how ? `That keeps it safe, but by ${VERB[how]}. This time, ${ASK[o.answer.method]}.` : 'That piece is still in danger. Try again.', 'bad')
    } else {
      say('Not quite. Try again.', 'bad')
    }
    window.setTimeout(() => {
      chess.undo()
      board.setFen(chess.fen())
      board.setLastMove(null)
      busy = false
      offerHelp()
    }, 750)
  }

  board.onSquare = (sq) => {
    if (finished || busy) return
    if (selected && sq !== selected && legalTargets(selected).includes(sq)) {
      const from = selected
      selected = null
      attempt(from, sq)
      return
    }
    const p = chess.get(sq as never)
    if (p && p.color === chess.turn() && sq !== selected) {
      selected = sq
      board.setSelected(sq, legalTargets(sq))
    } else {
      selected = null
      board.setSelected(null)
    }
  }

  // Dragging a piece does the same job as tap-then-tap: pick up (show where it may go), then drop.
  board.setDrag({
    canDrag: (sq) => {
      if (finished || busy) return false
      const p = chess.get(sq as never)
      return !!p && p.color === chess.turn()
    },
    onStart: (from) => {
      selected = from
      board.setSelected(from, legalTargets(from))
    },
    onDrop: (from, to) => {
      if (finished || busy || to === from) return // put back where it came from: it stays picked up, like a tap
      selected = null
      if (legalTargets(from).includes(to)) attempt(from, to)
      else board.setSelected(null) // not a legal square: the piece snaps back
    },
    onCancel: () => {
      selected = null
      board.setSelected(null)
    },
  })

  if (o.prior?.done) {
    // Revisiting a solved task: show the finished line.
    if (o.goal === 'san') {
      try {
        for (const m of o.solution) chess.move(m)
      } catch {
        /* keep whatever was played */
      }
      board.setFen(chess.fen())
    }
    finished = true
    board.setInteractive(false)
    say(o.prior.shown ? 'You looked at the answer for this one.' : 'Solved.', o.prior.shown ? 'info' : 'ok')
  } else {
    say(saySide())
  }
  return { el, board }
}
