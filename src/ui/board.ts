import type { Square } from '../types'
import { DragMachine } from '../lib/drag'
import { FILES, placement, sqName } from '../lib/fen'
import { pieceName } from './pieces'

export interface BoardOptions {
  fen: string
  /** Black at the bottom. */
  flip?: boolean
  highlight?: Square[]
  arrows?: [Square, Square][]
  /** Squares become buttons and `onSquare` fires on tap. */
  interactive?: boolean
  label?: string
}

/** What a board needs to know to let pieces be dragged. All of it is about chess rules, which the board does not know. */
export interface DragHandlers {
  /** May the piece on this square be picked up right now? */
  canDrag(sq: Square): boolean
  /** The piece has been picked up (the pointer travelled past the threshold). */
  onStart(from: Square): void
  /** Released on a square of this board. `to` equals `from` when it is put back where it came from. */
  onDrop(from: Square, to: Square): void
  /** Released off the board, or the drag was abandoned. */
  onCancel(from: Square): void
}

export interface Board {
  el: HTMLElement
  onSquare: ((sq: Square) => void) | null
  setFen(fen: string): void
  setHighlight(sqs: Square[]): void
  setArrows(arrows: [Square, Square][]): void
  /** Mark the picked-up piece and the squares it can go to. */
  setSelected(sq: Square | null, targets?: Square[]): void
  setLastMove(from: Square | null, to?: Square | null): void
  /** Briefly colour a square green or red. */
  flash(sq: Square, kind: 'good' | 'bad'): void
  /** Colour a square until cleared (used when revealing an answer). */
  mark(sq: Square, kind: 'good' | 'bad'): void
  clearMarks(): void
  setInteractive(on: boolean): void
  /** Let pieces be dragged (pass null to turn dragging off). Tapping always works as well. */
  setDrag(handlers: DragHandlers | null): void
}

const SVG_NS = 'http://www.w3.org/2000/svg'

export function createBoard(opts: BoardOptions): Board {
  const flip = !!opts.flip
  let fen = opts.fen
  let interactive = !!opts.interactive
  let highlight = new Set<Square>(opts.highlight ?? [])
  let selected: Square | null = null
  let targets = new Set<Square>()
  let last: Square[] = []
  let dragFrom: Square | null = null // the piece being dragged (shown faded while its ghost follows the pointer)
  const marks = new Map<Square, 'good' | 'bad'>()

  const el = document.createElement('div')
  el.className = 'board'
  el.setAttribute('role', interactive ? 'group' : 'img')

  const grid = document.createElement('div')
  grid.className = 'board-grid'
  el.appendChild(grid)

  const cells = new Map<Square, HTMLElement>()
  const ranks = flip ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
  const files = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
  for (const r of ranks) {
    for (const f of files) {
      const name = sqName(f, r)
      const cell = document.createElement('div')
      cell.className = 'sq ' + ((f + r) % 2 === 0 ? 'd' : 'l')
      cell.dataset.sq = name
      if (f === files[0]) cell.dataset.rank = String(r + 1)
      if (r === ranks[7]) cell.dataset.file = FILES[f]
      grid.appendChild(cell)
      cells.set(name, cell)
    }
  }

  let arrowLayer: SVGSVGElement | null = null

  function drawArrows(arrows: [Square, Square][]): void {
    if (arrowLayer) arrowLayer.remove()
    arrowLayer = null
    if (!arrows.length) return
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('class', 'board-arrows')
    svg.setAttribute('viewBox', '0 0 8 8')
    svg.setAttribute('aria-hidden', 'true')
    const centre = (sq: Square): [number, number] => {
      const f = FILES.indexOf(sq[0])
      const r = Number(sq[1]) - 1
      return [(flip ? 7 - f : f) + 0.5, (flip ? r : 7 - r) + 0.5]
    }
    for (const [a, b] of arrows) {
      const [x1, y1] = centre(a)
      const [x2, y2] = centre(b)
      const len = Math.hypot(x2 - x1, y2 - y1) || 1
      const ux = (x2 - x1) / len
      const uy = (y2 - y1) / len
      // Start and stop short of the square centres so the arrow never buries a piece.
      const sx = x1 + ux * 0.3
      const sy = y1 + uy * 0.3
      const tx = x2 - ux * 0.2
      const ty = y2 - uy * 0.2
      const head = 0.34
      const bx = tx - ux * head
      const by = ty - uy * head
      if (Math.hypot(bx - sx, by - sy) > 0.05 && (bx - sx) * ux + (by - sy) * uy > 0) {
        const line = document.createElementNS(SVG_NS, 'line')
        line.setAttribute('x1', String(sx))
        line.setAttribute('y1', String(sy))
        line.setAttribute('x2', String(bx))
        line.setAttribute('y2', String(by))
        line.setAttribute('class', 'arrow-line')
        svg.appendChild(line)
      }
      const poly = document.createElementNS(SVG_NS, 'polygon')
      const px = -uy * 0.2
      const py = ux * 0.2
      poly.setAttribute('points', `${tx},${ty} ${bx + px},${by + py} ${bx - px},${by - py}`)
      poly.setAttribute('class', 'arrow-head')
      svg.appendChild(poly)
    }
    el.appendChild(svg)
    arrowLayer = svg
  }

  function paint(): void {
    const pcs = placement(fen)
    const described: string[] = []
    for (let i = 0; i < 64; i++) {
      const r = 7 - Math.floor(i / 8)
      const f = i % 8
      const name = sqName(f, r)
      const cell = cells.get(name)!
      const letter = pcs[i]
      const cls = ['sq', (f + r) % 2 === 0 ? 'd' : 'l']
      if (highlight.has(name)) cls.push('hl')
      if (last.includes(name)) cls.push('last')
      if (name === selected) cls.push('sel')
      if (letter) cls.push('hp') // has piece
      if (name === dragFrom) cls.push('dragging')
      if (targets.has(name)) cls.push(letter ? 'tgt-cap' : 'tgt')
      const m = marks.get(name)
      if (m) cls.push(m)
      cell.className = cls.join(' ')
      if (letter) {
        const side = letter === letter.toUpperCase() ? 'w' : 'b'
        cell.innerHTML = `<svg class="pc pc-${side}" viewBox="0 0 45 45" aria-hidden="true"><use href="#pc-${side}${letter.toLowerCase()}"/></svg>`
        described.push(`${pieceName(letter)} ${name}`)
      } else if (cell.firstChild) {
        cell.textContent = ''
      }
      if (interactive) cell.setAttribute('aria-label', letter ? `${name}, ${pieceName(letter)}` : name)
    }
    if (!interactive) el.setAttribute('aria-label', opts.label ?? 'Chess position: ' + described.join(', '))
  }

  /** Squares are buttons only on interactive boards (keeps static boards out of the tab order). */
  function applyInteractive(): void {
    el.setAttribute('role', interactive ? 'group' : 'img')
    el.classList.toggle('interactive', interactive)
    for (const cell of cells.values()) {
      if (interactive) {
        cell.setAttribute('role', 'button')
        cell.tabIndex = 0
      } else {
        cell.removeAttribute('role')
        cell.removeAttribute('aria-label')
        cell.removeAttribute('tabindex')
      }
    }
    if (interactive) el.setAttribute('aria-label', opts.label ?? 'Chess board')
  }

  const api: Board = {
    el,
    onSquare: null,
    setFen(next) {
      fen = next
      paint()
    },
    setHighlight(sqs) {
      highlight = new Set(sqs)
      paint()
    },
    setArrows(arrows) {
      drawArrows(arrows)
    },
    setSelected(sq, tg = []) {
      selected = sq
      targets = new Set(tg)
      paint()
    },
    setLastMove(from, to) {
      last = from && to ? [from, to] : []
      paint()
    },
    flash(sq, kind) {
      const cell = cells.get(sq)
      if (!cell) return
      cell.classList.add(kind, 'flash')
      window.setTimeout(() => cell.classList.remove(kind, 'flash'), 700)
    },
    mark(sq, kind) {
      marks.set(sq, kind)
      paint()
    },
    clearMarks() {
      marks.clear()
      paint()
    },
    setInteractive(on) {
      interactive = on
      if (!on) abandonDrag()
      applyInteractive()
      paint()
    },
    setDrag(handlers) {
      if (!handlers) abandonDrag()
      dragHandlers = handlers
      el.classList.toggle('can-drag', !!handlers)
    },
  }

  // ---- Dragging pieces (mouse, touch and pen all go through pointer events) ----------------------
  const drag = new DragMachine(5)
  let dragHandlers: DragHandlers | null = null
  let ghost: HTMLElement | null = null
  let overCell: HTMLElement | null = null
  let touchDrag = false
  let lastDragEnd = 0

  const squareAt = (x: number, y: number): Square | null => {
    const cell = document.elementFromPoint(x, y)?.closest?.('.sq') as HTMLElement | null
    return cell && grid.contains(cell) ? (cell.dataset.sq ?? null) : null
  }

  function moveGhost(x: number, y: number): void {
    if (!ghost) return
    const w = ghost.offsetWidth
    // On a touch screen the piece rides above the finger so the finger does not hide it.
    ghost.style.transform = `translate(${Math.round(x - w / 2)}px, ${Math.round(y - w / 2 - (touchDrag ? w * 0.7 : 0))}px)`
  }

  function setOver(sq: Square | null): void {
    const next = sq ? (cells.get(sq) ?? null) : null
    if (next === overCell) return
    overCell?.classList.remove('drag-over')
    next?.classList.add('drag-over')
    overCell = next
  }

  function endDragVisuals(): void {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    window.removeEventListener('keydown', onDragKey)
    window.removeEventListener('blur', onPointerCancel)
    ghost?.remove()
    ghost = null
    setOver(null)
    document.body.classList.remove('dragging-piece')
    if (dragFrom) {
      dragFrom = null
      paint()
    }
  }

  /** Stop any press or drag without telling anyone it was dropped (used when the board is switched off). */
  function abandonDrag(): void {
    if (!drag.pressed) return
    drag.cancel()
    endDragVisuals()
  }

  function onPointerDown(e: PointerEvent): void {
    if (!interactive || !dragHandlers || !e.isPrimary || drag.pressed) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const sq = hit(e.target)
    if (!sq || !dragHandlers.canDrag(sq)) return
    touchDrag = e.pointerType === 'touch'
    drag.down(e.pointerId, sq, e.clientX, e.clientY)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onDragKey)
    window.addEventListener('blur', onPointerCancel)
  }

  function onPointerMove(e: PointerEvent): void {
    const phase = drag.move(e.pointerId, e.clientX, e.clientY)
    if (phase === 'none') return
    const from = drag.from!
    if (phase === 'start') {
      const piece = cells.get(from)?.querySelector('svg')
      const size = (cells.get(from)?.getBoundingClientRect().width ?? 48) * 1.2
      if (piece) {
        ghost = document.createElement('div')
        ghost.className = 'drag-ghost'
        ghost.style.width = ghost.style.height = size + 'px'
        ghost.appendChild(piece.cloneNode(true))
        document.body.appendChild(ghost)
      }
      document.body.classList.add('dragging-piece')
      dragFrom = from
      dragHandlers?.onStart(from) // shows where the piece can go; also repaints, so `dragging` is set first
    }
    moveGhost(e.clientX, e.clientY)
    setOver(squareAt(e.clientX, e.clientY))
  }

  function onPointerUp(e: PointerEvent): void {
    const out = drag.up(e.pointerId, squareAt(e.clientX, e.clientY))
    if (!out) return
    endDragVisuals()
    if (out.kind === 'tap') return // the click that follows handles a tap
    lastDragEnd = Date.now() // ...and a click that follows a drag must not move anything
    if (out.kind === 'drop') dragHandlers?.onDrop(out.from, out.to)
    else dragHandlers?.onCancel(out.from)
  }

  function onPointerCancel(): void {
    const c = drag.cancel()
    endDragVisuals()
    if (c?.wasDragging) dragHandlers?.onCancel(c.from)
  }

  function onDragKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') onPointerCancel()
  }

  grid.addEventListener('pointerdown', onPointerDown)
  grid.addEventListener('dragstart', (e) => e.preventDefault()) // no native drag image

  const hit = (t: EventTarget | null): Square | null => {
    const cell = (t as HTMLElement | null)?.closest?.('.sq') as HTMLElement | null
    return cell?.dataset.sq ?? null
  }
  grid.addEventListener('click', (e) => {
    if (!interactive) return
    if (Date.now() - lastDragEnd < 60) return // the click a browser fires after a drag ends on the same square
    const sq = hit(e.target)
    if (sq && api.onSquare) api.onSquare(sq)
  })
  grid.addEventListener('keydown', (e) => {
    if (!interactive || (e.key !== 'Enter' && e.key !== ' ')) return
    const sq = hit(e.target)
    if (sq && api.onSquare) {
      e.preventDefault()
      api.onSquare(sq)
    }
  })

  applyInteractive()
  drawArrows(opts.arrows ?? [])
  paint()
  return api
}
