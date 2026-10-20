import { afterEach, describe, expect, it, vi } from 'vitest'
import { CARD_H, CARD_W, drawShareCard, ellipsize, fitText, footerHost, wrapText, type CardInfo, type Ctx2D } from '../src/lib/shareCard'
import { pictureName, shareImage } from '../src/lib/share'

/** A pretend canvas that remembers what was drawn, so the layout can be checked without a browser. */
function fakeCtx() {
  const texts: { s: string; x: number; y: number; font: string }[] = []
  let images = 0
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect: () => undefined,
    fillText(s: string, x: number, y: number) {
      texts.push({ s, x, y, font: ctx.font })
    },
    // every character is 0.5 em wide, whatever the font
    measureText(s: string) {
      const size = Number(/(\d+)px/.exec(ctx.font)?.[1] ?? 10)
      return { width: Array.from(s).length * size * 0.5 }
    },
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    arcTo: () => undefined,
    closePath: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    drawImage: () => {
      images++
    },
  }
  return { ctx: ctx as unknown as Ctx2D, texts, images: () => images }
}

const info: CardInfo = {
  name: 'Bridge Grind',
  day: 6,
  totalDays: 14,
  title: 'The checklist',
  level: '600-1000',
  right: 11,
  total: 12,
  wentDeeper: true,
  done: [true, true, true, true, true, true, ...Array(8).fill(false)],
  note: 'Check every capture',
  dateText: 'Tue 20 Oct',
  host: 'castleconnectug.netlify.app',
}

describe('wrapping text for the picture', () => {
  const measure = (s: string) => s.length * 10

  it('breaks lines at word boundaries', () => {
    expect(wrapText(measure, 'one two three four', 90)).toEqual(['one two', 'three', 'four'])
  })
  it('splits a word that is wider than the line', () => {
    expect(wrapText(measure, 'abcdefghij', 40)).toEqual(['abcd', 'efgh', 'ij'])
  })
  it('keeps new lines the member typed', () => {
    expect(wrapText(measure, 'a\nb', 90)).toEqual(['a', 'b'])
  })
  it('adds an ellipsis only when the line is too long', () => {
    expect(ellipsize(measure, 'short', 100)).toBe('short')
    expect(ellipsize(measure, 'a very long line indeed', 100).endsWith('…')).toBe(true)
    expect(measure(ellipsize(measure, 'a very long line indeed', 100))).toBeLessThanOrEqual(100)
  })
})

describe('fitting the note into its box', () => {
  const at = (size: number) => (s: string) => s.length * size * 0.5

  it('uses the biggest size that fits', () => {
    const r = fitText(at, 'short note', 800, 300, [46, 40, 30])
    expect(r.size).toBe(46)
    expect(r.lines).toEqual(['short note'])
  })
  it('shrinks a long note until it fits', () => {
    const note = 'word '.repeat(48).trim() // 240 characters
    const r = fitText(at, note, 860, 240, [46, 42, 38, 35, 32, 30, 28])
    expect(r.size).toBeLessThan(46)
    expect(r.lines.length * r.size * 1.3).toBeLessThanOrEqual(240)
    expect(r.lines.join(' ')).toBe(note)
  })
  it('cuts off with an ellipsis as a last resort', () => {
    const r = fitText(at, 'word '.repeat(400), 300, 100, [30, 28])
    expect(r.lines.length * r.size * 1.3).toBeLessThanOrEqual(100)
    expect(r.lines[r.lines.length - 1].endsWith('…')).toBe(true)
  })
})

describe('the picture', () => {
  it('is a 4:5 portrait', () => {
    expect(CARD_W / CARD_H).toBeCloseTo(0.8, 5)
  })

  it('shows every detail of the day', () => {
    const { ctx, texts, images } = fakeCtx()
    drawShareCard(ctx, info, {} as CanvasImageSource)
    const all = texts.map((t) => t.s)
    expect(images()).toBe(1) // the logo
    expect(all).toContain('Day 6 done')
    expect(all).toContain('The checklist')
    expect(all).toContain('Level 600–1000')
    expect(all).toContain('Went deeper too')
    expect(all).toContain('11 of 12')
    expect(all).toContain('right first time')
    expect(all).toContain('6 of 14')
    expect(all).toContain('days done')
    expect(all).toContain('Tue 20 Oct')
    expect(all).toContain('BRIDGE GRIND')
    expect(all).toContain('Castle Connect UG · For Open Minds')
    expect(all).toContain('castleconnectug.netlify.app')
    for (let n = 1; n <= 14; n++) expect(all).toContain(String(n)) // the 14 day dots
    expect(all.join(' ')).toContain('Check every capture')
  })

  it('leaves out what does not apply', () => {
    const { ctx, texts } = fakeCtx()
    drawShareCard(ctx, { ...info, wentDeeper: false, total: 0, note: '  ', host: '' }, null)
    const all = texts.map((t) => t.s)
    expect(all).not.toContain('Went deeper too')
    expect(all).not.toContain('right first time')
    expect(all).toContain('Lesson done')
    expect(all).toContain('JOIN US') // an invitation instead of an empty note box
    expect(all).not.toContain('ONE THING I LEARNED')
    expect(all).not.toContain('castleconnectug.netlify.app')
    expect(all).toContain('Castle Connect') // the logo failed to load: the name is written instead
  })

  it('keeps everything inside the picture, even for a very long title and note', () => {
    const { ctx, texts } = fakeCtx()
    drawShareCard(ctx, { ...info, title: 'A very long lesson title '.repeat(6), note: 'x'.repeat(240) }, null)
    for (const t of texts) {
      const size = Number(/(\d+)px/.exec(t.font)?.[1])
      const w = t.s.length * size * 0.5
      if (t.x <= CARD_W / 2 && t.x >= 0) expect(t.x + w).toBeLessThanOrEqual(CARD_W + 1)
      expect(t.y).toBeLessThanOrEqual(CARD_H)
    }
  })

  it('prints no address while testing on this computer', () => {
    expect(footerHost('localhost')).toBe('')
    expect(footerHost('127.0.0.1')).toBe('')
    expect(footerHost('')).toBe('')
    expect(footerHost('castleconnectug.netlify.app')).toBe('castleconnectug.netlify.app')
  })
})

describe('sharing the picture', () => {
  afterEach(() => vi.unstubAllGlobals())
  const png = new Blob(['x'], { type: 'image/png' })

  it('names the file after the challenge and the day', () => {
    expect(pictureName('Bridge Grind', 6)).toBe('bridge-grind-day-6.png')
    expect(pictureName('???', 2)).toBe('progress-day-2.png')
  })

  it('sends the picture and the message through the phone share menu', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, canShare: () => true })
    expect(await shareImage(png, 'a.png', 'caption')).toBe('shared')
    const arg = share.mock.calls[0][0]
    expect(arg.text).toBe('caption')
    expect(arg.files[0].name).toBe('a.png')
    expect(arg.files[0].type).toBe('image/png')
  })

  it('says unsupported where files cannot be shared, so the page can offer a download', async () => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => false })
    expect(await shareImage(png, 'a.png', 't')).toBe('unsupported')
    vi.stubGlobal('navigator', {})
    expect(await shareImage(png, 'a.png', 't')).toBe('unsupported')
  })

  it('treats closing the share sheet as a cancel', async () => {
    const err = Object.assign(new Error('x'), { name: 'AbortError' })
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(err), canShare: () => true })
    expect(await shareImage(png, 'a.png', 't')).toBe('cancelled')
  })
})
