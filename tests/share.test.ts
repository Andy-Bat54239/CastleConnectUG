import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMessage, shareText, waLink } from '../src/lib/share'

describe('share message', () => {
  const base = { name: 'Bridge Grind', day: 6, right: 4, total: 5, note: 'Check every capture', wentDeeper: false }

  it('matches the format in the brief', () => {
    expect(buildMessage(base)).toBe('Bridge Grind · Day 6 done ✅\nQuiz: 4/5 right\nOne thing I learned: Check every capture')
  })
  it('shows a placeholder when the member writes nothing', () => {
    expect(buildMessage({ ...base, note: '   ' })).toContain('One thing I learned: …')
  })
  it('mentions going deeper', () => {
    expect(buildMessage({ ...base, wentDeeper: true })).toContain('Went deeper too')
  })
  it('leaves out the quiz line when nothing was scored', () => {
    expect(buildMessage({ ...base, total: 0 })).not.toContain('Quiz')
  })
  it('builds a wa.me link with the text encoded', () => {
    const link = waLink('Day 1 ✅\nhello & goodbye')
    expect(link.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(link.split('=')[1])).toBe('Day 1 ✅\nhello & goodbye')
  })
})

describe('share chain', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the phone share menu first', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    expect(await shareText('hi')).toBe('shared')
    expect(share).toHaveBeenCalledWith({ text: 'hi' })
  })

  it('treats closing the share sheet as a cancel, not a failure', async () => {
    const err = Object.assign(new Error('x'), { name: 'AbortError' })
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(err) })
    expect(await shareText('hi')).toBe('cancelled')
  })

  it('falls back to the clipboard when sharing fails', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new Error('nope')), clipboard: { writeText } })
    expect(await shareText('hi')).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('hi')
  })

  it('falls back to the clipboard when there is no share menu', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await shareText('hi')).toBe('copied')
  })

  it('reports manual when nothing works', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', {
      createElement: () => ({ setAttribute() {}, style: {}, select() {}, value: '' }),
      body: { appendChild() {}, removeChild() {} },
      execCommand: () => false,
    })
    expect(await shareText('hi')).toBe('manual')
  })
})
