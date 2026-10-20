import { Chess } from 'chess.js'
import type { Card, DayContent } from '../types'
import { loadDay } from '../lib/content'
import { mateAvoidingMoves, matingMoves } from '../lib/chessUtil'
import { answersByMethod } from '../lib/verify'
import { createBoard } from './board'
import { estimateMinutes } from '../lib/estimate'
import { h, loadingView, paragraphs, rich } from './dom'

function rv(cls: string, text: string): HTMLElement {
  const p = h('p', { class: cls })
  p.append(rich(text))
  return p
}

const LABEL: Record<Card['type'], string> = { read: 'read', choice: 'quick question', findMove: 'find the move', spot: 'spot it', puzzleSet: 'puzzle set' }

function answerText(c: Card & { type: 'findMove' }): string {
  const chess = new Chess(c.fen)
  if (c.goal === 'mate') return 'Any checkmating move: ' + matingMoves(chess).join(', ')
  if (c.goal === 'answer' && c.verify?.target) return `Any move that answers by "${c.verify.method}": ` + answersByMethod(chess, c.verify.target, c.verify.method ?? 'any').join(', ')
  if (c.goal === 'avoidMate') return 'Any move that stops the mate threat: ' + mateAvoidingMoves(chess).join(', ')
  const line = (c.solution ?? []).join(' ')
  return line + (c.accept?.length ? `   (also accepted: ${c.accept.join(', ')})` : '')
}

function cardBlock(c: Card, i: number): HTMLElement {
  const box = h('article', { class: 'rv-card' })
  box.append(h('p', { class: 'rv-label' }, `${i + 1} · ${LABEL[c.type]}`))
  switch (c.type) {
    case 'read':
      box.append(h('h3', null, c.title), ...paragraphs(c.body))
      if (c.board) box.append(createBoard({ fen: c.board.fen, flip: c.board.flip, highlight: c.board.highlight, arrows: c.board.arrows }).el)
      break
    case 'choice': {
      { const t = h('h3'); t.append(rich(c.prompt)); box.append(t) }
      if (c.board) box.append(createBoard({ fen: c.board.fen, flip: c.board.flip, highlight: c.board.highlight }).el)
      const ul = h('ul', { class: 'rv-opts' })
      c.options.forEach((o, j) => {
        const li = h('li', { class: j === c.answer ? 'right' : '' })
        li.append(j === c.answer ? '✓ ' : '', rich(o))
        ul.append(li)
      })
      box.append(ul, rv('rv-explain', c.explain))
      break
    }
    case 'findMove': {
      { const t = h('h3'); t.append(rich(c.prompt)); box.append(t) }
      const turn = new Chess(c.fen).turn()
      box.append(createBoard({ fen: c.fen, flip: turn === 'b', highlight: c.highlight, arrows: c.arrows }).el)
      box.append(h('p', { class: 'rv-answer' }, 'Answer: ' + answerText(c)), rv('rv-explain', c.explain))
      if (c.hint) box.append(h('p', { class: 'mute' }, 'Hint: ' + c.hint))
      break
    }
    case 'spot': {
      { const t = h('h3'); t.append(rich(c.prompt)); box.append(t) }
      const b = createBoard({ fen: c.board.fen, flip: c.board.flip, highlight: c.board.highlight, arrows: c.board.arrows })
      for (const t of c.targets) b.mark(t, 'good')
      box.append(b.el, h('p', { class: 'rv-answer' }, 'Correct square(s): ' + c.targets.join(', ')), rv('rv-explain', c.explain))
      break
    }
    case 'puzzleSet':
      box.append(h('h3', null, c.title), h('p', { class: 'mute' }, `${c.theme}${c.ratingMin ? `, rating ${c.ratingMin}-${c.ratingMax}` : ''}`))
      c.puzzles.forEach((p, j) => {
        const turn = new Chess(p.fen).turn()
        box.append(h('p', { class: 'rv-label' }, `Puzzle ${j + 1}`), createBoard({ fen: p.fen, flip: turn === 'b' }).el, h('p', { class: 'rv-answer' }, 'Solution: ' + p.solution.join(' ')))
      })
      break
  }
  return box
}

export async function mountReview(root: HTMLElement, day: number, current: () => boolean = () => true): Promise<void> {
  root.replaceChildren(loadingView(`Loading Day ${day}…`))
  const c: DayContent | null = await loadDay(day)
  if (!current()) return
  if (!c) {
    root.replaceChildren(h('section', { class: 'screen' }, h('h1', null, `No lesson for Day ${day} yet`)))
    return
  }
  const sec = (name: string, cards: Card[]) => [
    h('h2', { class: 'section-title' }, `${name}: ${cards.length} cards, about ${estimateMinutes(cards)} min`),
    h('div', { class: 'rv-grid' }, ...cards.map(cardBlock)),
  ]
  root.replaceChildren(
    h(
      'section',
      { class: 'screen wide' },
      h('p', { class: 'kicker' }, 'Review copy, not what members see'),
      h('h1', null, `Day ${c.day}: ${c.title}`),
      h('p', { class: 'lead' }, c.blurb),
      h('p', { class: 'mute' }, `Level ${c.level}. Go deeper: ${c.deeperTitle}.`),
    ),
    ...sec('Core', c.core),
    ...sec('Go deeper', c.deeper),
    h('p', { class: 'mute' }, 'Share prompt: ' + c.share.prompt),
  )
}
