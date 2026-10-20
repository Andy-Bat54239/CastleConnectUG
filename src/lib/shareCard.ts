import { LOGO_DATA_URI, LOGO_RATIO } from './shareLogo'

/**
 * The picture a member posts in the WhatsApp group: the Castle Connect logo plus every detail of their day
 * (which day, the lesson, their score, whether they went deeper, how many days they have done, the line
 * they wrote and the date). It is drawn on the member's own phone with a canvas, so it needs no server,
 * works offline once the page has loaded, and nothing about the member leaves the device until they
 * choose to share it.
 */

export const CARD_W = 1080
export const CARD_H = 1350

export interface CardInfo {
  /** Challenge name, e.g. "Bridge Grind". */
  name: string
  day: number
  totalDays: number
  /** The lesson's title and level, e.g. "The checklist", "600-1000". */
  title: string
  level: string
  right: number
  total: number
  wentDeeper: boolean
  /** One flag per day (index 0 is Day 1): did the member finish that day's core lesson? */
  done: boolean[]
  /** What the member wrote ("one thing I learned"). May be empty. */
  note: string
  /** "Tue 20 Oct", in Kampala time. */
  dateText: string
  /** The site address to print in the footer, or '' to leave it out. */
  host: string
}

/** The few canvas calls the card needs, so tests can supply a fake. */
export interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  measureText(text: string): { width: number }
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void
  closePath(): void
  fill(): void
  stroke(): void
  drawImage(img: CanvasImageSource, x: number, y: number, w: number, h: number): void
}

const C = {
  cream: '#fefae7',
  card: '#ffffff',
  emerald: '#034f3b',
  gold: '#e0ac40',
  goldSoft: '#f7e6b8',
  goldInk: '#7a5600',
  ink: '#0f241c',
  mute: '#4a5f56',
  line: '#e6deb6',
}
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
const MARGIN = 72
const INNER = CARD_W - MARGIN * 2

/** Break text into lines no wider than `maxWidth`. A single very long word is split by characters. */
export function wrapText(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const para of text.split(/\n+/)) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const trial = line ? line + ' ' + word : word
      if (measure(trial) <= maxWidth) {
        line = trial
        continue
      }
      if (line) out.push(line)
      if (measure(word) > maxWidth) {
        let chunk = ''
        for (const ch of Array.from(word)) {
          if (chunk && measure(chunk + ch) > maxWidth) {
            out.push(chunk)
            chunk = ch
          } else chunk += ch
        }
        line = chunk
      } else line = word
    }
    if (line) out.push(line)
  }
  return out
}

/** Add "…" to the end of a line, trimming characters until it fits. */
export function ellipsize(measure: (s: string) => number, line: string, maxWidth: number): string {
  if (measure(line) <= maxWidth) return line
  const chars = Array.from(line)
  while (chars.length > 1 && measure(chars.join('').trimEnd() + '…') > maxWidth) chars.pop()
  return chars.join('').trimEnd() + '…'
}

/** The largest font size (from `sizes`, big to small) at which the text fits the box; the smallest, cut off with "…", if none do. */
export function fitText(
  measureAt: (size: number) => (s: string) => number,
  text: string,
  maxWidth: number,
  maxHeight: number,
  sizes: number[],
  lineRatio = 1.3,
): { size: number; lines: string[] } {
  for (const size of sizes) {
    const lines = wrapText(measureAt(size), text, maxWidth)
    if (lines.length * size * lineRatio <= maxHeight) return { size, lines }
  }
  const size = sizes[sizes.length - 1]
  const measure = measureAt(size)
  const all = wrapText(measure, text, maxWidth)
  const room = Math.max(1, Math.floor(maxHeight / (size * lineRatio)))
  const lines = all.slice(0, room)
  if (all.length > room) lines[room - 1] = ellipsize(measure, lines[room - 1] + '…', maxWidth)
  return { size, lines }
}

function rounded(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function text(ctx: Ctx2D, s: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign = 'left'): void {
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(s, x, y)
}

function widthOf(ctx: Ctx2D, s: string, size: number, weight: number): number {
  ctx.font = `${weight} ${size}px ${FONT}`
  return ctx.measureText(s).width
}

/** A text line that is shrunk (down to `min`) until it fits `maxWidth`, then cut off with "…" if it still does not. */
function fitOneLine(ctx: Ctx2D, s: string, size: number, min: number, weight: number, maxWidth: number): { s: string; size: number } {
  let z = size
  while (z > min && widthOf(ctx, s, z, weight) > maxWidth) z -= 2
  return { s: ellipsize((t) => widthOf(ctx, t, z, weight), s, maxWidth), size: z }
}

function check(ctx: Ctx2D, cx: number, cy: number, r: number, color: string): void {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.42, cy + r * 0.02)
  ctx.lineTo(cx - r * 0.1, cy + r * 0.34)
  ctx.lineTo(cx + r * 0.46, cy - r * 0.3)
  ctx.stroke()
}

function pill(ctx: Ctx2D, label: string, x: number, y: number, h: number, size: number, bg: string, fg: string, withCheck = false): number {
  const pad = h * 0.5
  const tick = withCheck ? h * 0.7 : 0
  const w = widthOf(ctx, label, size, 800) + pad * 2 + tick
  ctx.fillStyle = bg
  rounded(ctx, x, y, w, h, h / 2)
  ctx.fill()
  if (withCheck) check(ctx, x + pad + h * 0.25, y + h / 2, h * 0.34, fg)
  text(ctx, label, x + pad + tick, y + h / 2 + size * 0.35, size, 800, fg)
  return w
}

function box(ctx: Ctx2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = C.card
  rounded(ctx, x, y, w, h, 28)
  ctx.fill()
  ctx.strokeStyle = C.line
  ctx.lineWidth = 3
  ctx.stroke()
}

/** Draw the whole picture. `logo` is the logo as a drawable image, or null if it could not be loaded. */
export function drawShareCard(ctx: Ctx2D, i: CardInfo, logo: CanvasImageSource | null): void {
  // background
  ctx.fillStyle = C.cream
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // header: logo on the left, challenge name and date on the right
  const logoW = 420
  const logoH = logoW / LOGO_RATIO
  if (logo) ctx.drawImage(logo, MARGIN, 52, logoW, logoH)
  else text(ctx, 'Castle Connect', MARGIN, 140, 64, 800, C.emerald)
  text(ctx, i.name.toUpperCase(), CARD_W - MARGIN, 108, 44, 900, C.emerald, 'right')
  text(ctx, `${i.totalDays}-day chess challenge`, CARD_W - MARGIN, 150, 28, 600, C.mute, 'right')
  text(ctx, i.dateText, CARD_W - MARGIN, 192, 28, 800, C.goldInk, 'right')
  ctx.fillStyle = C.line
  ctx.fillRect(MARGIN, 250, INNER, 3)

  // the headline: "Day 6 done" with a gold tick
  text(ctx, `Day ${i.day} done`, MARGIN, 380, 120, 900, C.emerald)
  ctx.fillStyle = C.gold
  ctx.beginPath()
  ctx.arc(CARD_W - MARGIN - 52, 336, 52, 0, Math.PI * 2)
  ctx.fill()
  check(ctx, CARD_W - MARGIN - 52, 336, 52, C.ink)

  // the lesson title and the chips under it
  const t = fitOneLine(ctx, i.title, 52, 34, 800, INNER)
  text(ctx, t.s, MARGIN, 446, t.size, 800, C.ink)
  let x = MARGIN
  x += pill(ctx, `Level ${i.level.replace('-', '–')}`, x, 482, 50, 26, C.goldSoft, C.goldInk) + 14
  if (i.wentDeeper) pill(ctx, 'Went deeper too', x, 482, 50, 26, C.emerald, C.cream, true)

  // two stat boxes
  const bw = (INNER - 24) / 2
  const by = 566
  box(ctx, MARGIN, by, bw, 160)
  if (i.total > 0) {
    text(ctx, `${i.right} of ${i.total}`, MARGIN + 32, by + 94, 78, 900, C.emerald)
    text(ctx, 'right first time', MARGIN + 32, by + 134, 30, 600, C.mute)
  } else {
    text(ctx, 'Lesson done', MARGIN + 32, by + 94, 62, 900, C.emerald)
    text(ctx, 'every card finished', MARGIN + 32, by + 134, 30, 600, C.mute)
  }
  const doneCount = i.done.filter(Boolean).length
  box(ctx, MARGIN + bw + 24, by, bw, 160)
  text(ctx, `${doneCount} of ${i.totalDays}`, MARGIN + bw + 24 + 32, by + 94, 78, 900, C.emerald)
  text(ctx, 'days done', MARGIN + bw + 24 + 32, by + 134, 30, 600, C.mute)

  // one dot per day: finished days solid, today gold, the rest outlined
  const d = 52
  const gap = (INNER - d * i.totalDays) / (i.totalDays - 1)
  for (let n = 1; n <= i.totalDays; n++) {
    const cx = MARGIN + d / 2 + (n - 1) * (d + gap)
    const cy = 782
    const isToday = n === i.day
    const isDone = !!i.done[n - 1]
    ctx.beginPath()
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
    ctx.fillStyle = isToday ? C.gold : isDone ? C.emerald : C.cream
    ctx.fill()
    if (!isToday && !isDone) {
      ctx.strokeStyle = C.mute
      ctx.lineWidth = 3
      ctx.stroke()
    }
    text(ctx, String(n), cx, cy + 9, 24, 800, isToday ? C.ink : isDone ? C.cream : C.mute, 'center')
  }

  // what the member wrote
  const note = i.note.trim()
  if (note) {
    const qy = 840
    const qh = 364
    box(ctx, MARGIN, qy, INNER, qh)
    ctx.fillStyle = C.gold
    ctx.fillRect(MARGIN + 36, qy + 36, 8, 28)
    text(ctx, 'ONE THING I LEARNED', MARGIN + 62, qy + 60, 26, 800, C.goldInk)
    const textW = INNER - 72
    const fit = fitText(
      (size) => (s) => widthOf(ctx, s, size, 600),
      note,
      textW,
      qh - 130,
      [46, 42, 38, 35, 32, 30, 28],
    )
    const lh = fit.size * 1.3
    fit.lines.forEach((line, n) => text(ctx, line, MARGIN + 36, qy + 118 + fit.size + n * lh, fit.size, 600, C.ink))
  } else {
    // nothing written: invite the group instead of leaving a gap
    const qy = 840
    ctx.fillStyle = C.goldSoft
    rounded(ctx, MARGIN, qy, INNER, 364, 28)
    ctx.fill()
    text(ctx, 'JOIN US', MARGIN + 36, qy + 70, 26, 800, C.goldInk)
    text(ctx, `${i.totalDays} days. 15 minutes a day.`, MARGIN + 36, qy + 160, 56, 900, C.emerald)
    const line = 'Learn chess step by step with Castle Connect.'
    wrapText((t) => widthOf(ctx, t, 36, 600), line, INNER - 72).forEach((l, n) => text(ctx, l, MARGIN + 36, qy + 230 + n * 50, 36, 600, C.ink))
  }

  // footer band: the community's name, and the site address when there is one
  ctx.fillStyle = C.gold
  ctx.fillRect(0, 1222, CARD_W, 8)
  ctx.fillStyle = C.emerald
  ctx.fillRect(0, 1230, CARD_W, CARD_H - 1230)
  if (i.host) {
    text(ctx, 'Castle Connect UG · For Open Minds', MARGIN, 1287, 34, 800, C.cream)
    text(ctx, i.host, MARGIN, 1327, 27, 700, C.gold)
  } else {
    text(ctx, 'Castle Connect UG · For Open Minds', MARGIN, 1300, 34, 800, C.cream)
  }
}

let logoPromise: Promise<HTMLImageElement | null> | null = null

function loadLogo(): Promise<HTMLImageElement | null> {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = LOGO_DATA_URI
    })
  }
  return logoPromise
}

/** Draw the picture and return it as a PNG. Rejects only if the browser has no canvas. */
export async function renderShareCard(info: CardInfo): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas is not available')
  drawShareCard(ctx as unknown as Ctx2D, info, await loadLogo())
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not make the picture'))), 'image/png')
  })
}

/** The site address for the footer: nothing while testing on this computer. */
export function footerHost(hostname: string): string {
  if (!hostname || hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.endsWith('.local')) return ''
  return hostname
}
