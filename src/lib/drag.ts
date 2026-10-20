import type { Square } from '../types'

/**
 * Decides what a press on a piece means: a tap, or the start of a drag. No DOM in here, so the
 * rules are easy to test; the board feeds it pointer positions.
 *
 *   down -> (moves within `threshold`) -> up      = a tap (the click that follows moves the piece)
 *   down -> (moves beyond `threshold`) -> up      = a drag, dropped on a square or off the board
 */
export type DragRelease =
  | { kind: 'tap'; from: Square }
  | { kind: 'drop'; from: Square; to: Square } // `to` may equal `from` (put back where it came from)
  | { kind: 'off'; from: Square } // let go outside the board

export type DragMove = 'none' | 'start' | 'move'

export class DragMachine {
  private pointer: number | null = null
  private origin: Square | null = null
  private x0 = 0
  private y0 = 0
  private moved = false

  /** `threshold` is how many pixels the pointer must travel before a press becomes a drag. */
  constructor(private readonly threshold = 5) {}

  /** A piece is pressed (or touched). The caller has already checked that this piece may move. */
  down(pointerId: number, from: Square, x: number, y: number): void {
    this.pointer = pointerId
    this.origin = from
    this.x0 = x
    this.y0 = y
    this.moved = false
  }

  get pressed(): boolean {
    return this.pointer !== null
  }

  get dragging(): boolean {
    return this.pointer !== null && this.moved
  }

  get from(): Square | null {
    return this.origin
  }

  /** 'start' the first time the pointer travels past the threshold, 'move' after that. */
  move(pointerId: number, x: number, y: number): DragMove {
    if (pointerId !== this.pointer) return 'none'
    if (this.moved) return 'move'
    if (Math.hypot(x - this.x0, y - this.y0) < this.threshold) return 'none'
    this.moved = true
    return 'start'
  }

  /** The pointer is released. `over` is the square under it, or null when it is off the board. */
  up(pointerId: number, over: Square | null): DragRelease | null {
    if (pointerId !== this.pointer || !this.origin) return null
    const from = this.origin
    const wasDrag = this.moved
    this.reset()
    if (!wasDrag) return { kind: 'tap', from }
    return over ? { kind: 'drop', from, to: over } : { kind: 'off', from }
  }

  /** Abandon the press (Escape, the browser took the touch, the window lost focus). */
  cancel(): { from: Square; wasDragging: boolean } | null {
    if (!this.origin) return null
    const out = { from: this.origin, wasDragging: this.moved }
    this.reset()
    return out
  }

  private reset(): void {
    this.pointer = null
    this.origin = null
    this.moved = false
  }
}
