import type { Card, ChoiceCard, FindMoveCard, PuzzleSetCard, ReadCard, SpotCard } from '../types'
import type { CardResult } from '../lib/store'
import { createBoard, type Board } from './board'
import { button, h, paragraphs, rich } from './dom'
import { createMoveTask } from './moveTask'
import { createSpotTask } from './spotTask'

export interface CardCtx {
  /** Result key for this card, e.g. "c3" (core, card 3) or "d1" (deeper, card 1). */
  key: string
  results: Record<string, CardResult>
  save(key: string, res: CardResult): void
  /** Tell the lesson screen the card's done state may have changed. */
  notify(): void
}

export interface CardView {
  el: HTMLElement
  isDone(): boolean
}

/** Result keys that count towards the quiz score for a list of cards. */
export function scoredKeys(cards: Card[], prefix: string): string[] {
  const keys: string[] = []
  cards.forEach((c, i) => {
    if (c.type === 'choice' || c.type === 'findMove' || c.type === 'spot') keys.push(`${prefix}${i}`)
    else if (c.type === 'puzzleSet') c.puzzles.forEach((_, j) => keys.push(`${prefix}${i}.${j}`))
  })
  return keys
}

const KICKER: Record<Card['type'], string> = {
  read: 'Learn',
  choice: 'Quick question',
  findMove: 'Your move',
  spot: 'Spot it',
  puzzleSet: 'Puzzles',
}

function heading(text: string): HTMLElement {
  const el = h('h2')
  el.append(rich(text))
  return el
}

/**
 * Cards with a board are laid out in two columns on wide screens (board left, words right).
 * `card-visual` marks the part that goes left; the stylesheet does the rest.
 */
function visualBlock(card: HTMLElement, board: Board, caption?: string): HTMLElement {
  const block = h('div', { class: 'card-visual' }, board.el, caption ? h('p', { class: 'caption' }, caption) : null)
  card.classList.add('has-visual')
  return block
}

function shell(type: Card['type'], ...kids: (Node | null)[]): HTMLElement {
  return h('article', { class: `card card-${type}` }, h('p', { class: 'kicker' }, KICKER[type]), ...kids)
}

function explainBox(text: string, ok: boolean | null): HTMLElement {
  const box = h('div', { class: 'explain' + (ok === true ? ' ok' : ok === false ? ' bad' : '') })
  box.append(rich(text))
  // The footer is sticky, so bring fresh feedback into view above it.
  window.setTimeout(() => box.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }), 60)
  return box
}

function readCard(c: ReadCard): CardView {
  const el = shell('read', heading(c.title), ...paragraphs(c.body))
  if (c.board) {
    const b = createBoard({ fen: c.board.fen, flip: c.board.flip, highlight: c.board.highlight, arrows: c.board.arrows })
    el.append(visualBlock(el, b, c.board.caption))
  }
  return { el, isDone: () => true }
}

function choiceCard(c: ChoiceCard, ctx: CardCtx): CardView {
  const prior = ctx.results[ctx.key]
  const wrap = shell('choice', heading(c.prompt))
  if (c.board) {
    const b = createBoard({ fen: c.board.fen, flip: c.board.flip, highlight: c.board.highlight, arrows: c.board.arrows })
    wrap.append(visualBlock(wrap, b, c.board.caption))
  }
  const opts = h('div', { class: 'opts' })
  const fb = h('div', { class: 'fb-slot' })
  const buttons: HTMLButtonElement[] = []
  let chosen: number | null = null

  const settle = (i: number | null) => {
    buttons.forEach((b, j) => {
      b.disabled = true
      if (j === c.answer) b.classList.add('ok')
      else if (j === i) b.classList.add('bad')
    })
    fb.replaceChildren(explainBox((i === c.answer ? '**Correct.** ' : i === null ? '' : '**Not quite.** ') + c.explain, i === null ? null : i === c.answer))
  }

  c.options.forEach((label, i) => {
    const b = h('button', { type: 'button', class: 'opt' })
    b.append(rich(label))
    b.addEventListener('click', () => {
      if (chosen !== null || prior?.done) return
      chosen = i
      ctx.save(ctx.key, { done: true, first: i === c.answer, tries: 1 })
      settle(i)
      ctx.notify()
    })
    buttons.push(b)
    opts.append(b)
  })
  wrap.append(opts, fb)
  if (prior?.done) {
    chosen = prior.first ? c.answer : -1
    settle(prior.first ? c.answer : null)
  }
  return { el: wrap, isDone: () => chosen !== null || !!prior?.done }
}

function findMoveCard(c: FindMoveCard, ctx: CardCtx): CardView {
  const prior = ctx.results[ctx.key]
  const wrap = shell('findMove', heading(c.prompt))
  const fb = h('div', { class: 'fb-slot' })
  let done = !!prior?.done
  const task = createMoveTask({
    fen: c.fen,
    goal: c.goal ?? 'san',
    answer: c.goal === 'answer' && c.verify?.target ? { target: c.verify.target, method: c.verify.method ?? 'any' } : undefined,
    solution: c.solution ?? [],
    accept: c.accept ?? [],
    hint: c.hint,
    highlight: c.highlight,
    arrows: c.arrows,
    prior,
    onDone: (res) => {
      done = true
      ctx.save(ctx.key, res)
      fb.replaceChildren(explainBox(c.explain, res.first ? true : null))
      ctx.notify()
    },
  })
  task.el.classList.add('card-visual')
  wrap.classList.add('has-visual')
  wrap.append(task.el, fb)
  if (prior?.done) fb.replaceChildren(explainBox(c.explain, null))
  return { el: wrap, isDone: () => done }
}

function spotCard(c: SpotCard, ctx: CardCtx): CardView {
  const prior = ctx.results[ctx.key]
  const wrap = shell('spot', heading(c.prompt))
  const fb = h('div', { class: 'fb-slot' })
  let done = !!prior?.done
  const task = createSpotTask({
    spec: c.board,
    targets: c.targets,
    prior,
    onDone: (res) => {
      done = true
      ctx.save(ctx.key, res)
      fb.replaceChildren(explainBox(c.explain, res.first ? true : null))
      ctx.notify()
    },
  })
  task.classList.add('card-visual')
  wrap.classList.add('has-visual')
  wrap.append(task, fb)
  if (prior?.done) fb.replaceChildren(explainBox(c.explain, null))
  return { el: wrap, isDone: () => done }
}

function puzzleSetCard(c: PuzzleSetCard, ctx: CardCtx): CardView {
  const wrap = shell('puzzleSet', heading(c.title))
  if (c.intro) wrap.append(...paragraphs(c.intro))
  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' })
  const stage = h('div', { class: 'puzzle-stage' })
  const nav = h('div', { class: 'puzzle-nav' })
  stage.classList.add('card-visual')
  wrap.classList.add('has-visual')
  wrap.append(dots, stage, nav)

  const keyOf = (j: number) => `${ctx.key}.${j}`
  const doneAt = (j: number) => !!ctx.results[keyOf(j)]?.done
  const firstUndone = () => {
    for (let j = 0; j < c.puzzles.length; j++) if (!doneAt(j)) return j
    return c.puzzles.length - 1
  }
  let current = firstUndone()

  function paintDots(): void {
    dots.replaceChildren(
      ...c.puzzles.map((_, j) => {
        const r = ctx.results[keyOf(j)]
        const cls = 'dot' + (r?.done ? (r.first ? ' ok' : ' seen') : '') + (j === current ? ' now' : '')
        return h('span', { class: cls })
      }),
    )
  }

  function show(j: number): void {
    current = j
    paintDots()
    nav.replaceChildren()
    const p = c.puzzles[j]
    const prior = ctx.results[keyOf(j)]
    const label = h('p', { class: 'puzzle-count' }, `Puzzle ${j + 1} of ${c.puzzles.length}`)
    const fb = h('div', { class: 'fb-slot' })
    const task = createMoveTask({
      fen: p.fen,
      goal: 'san',
      solution: p.solution,
      accept: [],
      hint: p.hint,
      prior,
      onDone: (res) => {
        ctx.save(keyOf(j), res)
        if (p.explain) fb.replaceChildren(explainBox(p.explain, res.first ? true : null))
        paintDots()
        ctx.notify()
        addNav()
      },
    })
    stage.replaceChildren(label, task.el, fb)
    if (prior?.done) {
      if (p.explain) fb.replaceChildren(explainBox(p.explain, null))
      addNav()
    }
  }

  function addNav(): void {
    nav.replaceChildren()
    if (current < c.puzzles.length - 1) nav.append(button('Next puzzle', 'btn alt', () => show(current + 1)))
  }

  show(current)
  return { el: wrap, isDone: () => c.puzzles.every((_, j) => doneAt(j)) }
}

export function renderCard(card: Card, ctx: CardCtx): CardView {
  switch (card.type) {
    case 'read':
      return readCard(card)
    case 'choice':
      return choiceCard(card, ctx)
    case 'findMove':
      return findMoveCard(card, ctx)
    case 'spot':
      return spotCard(card, ctx)
    case 'puzzleSet':
      return puzzleSetCard(card, ctx)
  }
}
