import { describe, expect, it } from 'vitest'
import { DragMachine } from '../src/lib/drag'

describe('drag state machine', () => {
  it('treats a press that barely moves as a tap, leaving the click to move the piece', () => {
    const d = new DragMachine(5)
    d.down(1, 'e2', 100, 100)
    expect(d.move(1, 102, 101)).toBe('none') // jitter within the threshold
    expect(d.dragging).toBe(false)
    expect(d.up(1, 'e2')).toEqual({ kind: 'tap', from: 'e2' })
    expect(d.pressed).toBe(false)
  })

  it('starts a drag once the pointer travels past the threshold, and only reports start once', () => {
    const d = new DragMachine(5)
    d.down(1, 'e2', 100, 100)
    expect(d.move(1, 110, 100)).toBe('start')
    expect(d.dragging).toBe(true)
    expect(d.move(1, 150, 120)).toBe('move')
    expect(d.move(1, 100, 100)).toBe('move') // coming back does not end the drag
  })

  it('drops on the square under the pointer', () => {
    const d = new DragMachine(5)
    d.down(1, 'd2', 0, 0)
    d.move(1, 40, 0)
    expect(d.up(1, 'e3')).toEqual({ kind: 'drop', from: 'd2', to: 'e3' })
  })

  it('reports putting a piece back on its own square as a drop there', () => {
    const d = new DragMachine(5)
    d.down(1, 'd2', 0, 0)
    d.move(1, 40, 0)
    expect(d.up(1, 'd2')).toEqual({ kind: 'drop', from: 'd2', to: 'd2' })
  })

  it('reports letting go off the board', () => {
    const d = new DragMachine(5)
    d.down(1, 'd2', 0, 0)
    d.move(1, 400, 400)
    expect(d.up(1, null)).toEqual({ kind: 'off', from: 'd2' })
  })

  it('ignores a second finger or pointer', () => {
    const d = new DragMachine(5)
    d.down(1, 'd2', 0, 0)
    expect(d.move(2, 90, 90)).toBe('none')
    expect(d.up(2, 'e3')).toBeNull()
    expect(d.pressed).toBe(true) // the first pointer is still tracked
    expect(d.up(1, 'd2')).toEqual({ kind: 'tap', from: 'd2' })
  })

  it('does nothing when released without a press', () => {
    expect(new DragMachine().up(1, 'e4')).toBeNull()
  })

  it('cancels cleanly, saying whether a drag was under way', () => {
    const d = new DragMachine(5)
    d.down(1, 'g1', 0, 0)
    expect(d.cancel()).toEqual({ from: 'g1', wasDragging: false })
    d.down(2, 'g1', 0, 0)
    d.move(2, 30, 30)
    expect(d.cancel()).toEqual({ from: 'g1', wasDragging: true })
    expect(d.cancel()).toBeNull()
    expect(d.pressed).toBe(false)
  })

  it('can be used again straight after a drop', () => {
    const d = new DragMachine(5)
    d.down(1, 'a2', 0, 0)
    d.move(1, 30, 0)
    d.up(1, 'a4')
    d.down(2, 'b2', 0, 0)
    expect(d.move(2, 1, 1)).toBe('none')
    expect(d.up(2, 'b2')).toEqual({ kind: 'tap', from: 'b2' })
  })
})
