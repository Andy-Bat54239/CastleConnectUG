import type { Card, DayContent } from '../types'
import { course, loadDay, TOTAL_DAYS } from '../lib/content'
import * as store from '../lib/store'
import { challengeStatus, dayOpen, formatDate, getNow, isPreview, parseStart, unlockAt } from '../lib/time'
import { buildMessage, pictureName, shareImage, shareText, waLink } from '../lib/share'
import { renderCard, scoredKeys, type CardView } from './cards'
import { button, h, loadingView } from './dom'
import { themeButton } from './themeButton'

type Part = 'intro' | 'core' | 'deeper'

const HABITS = [
  'Solve a few puzzles (ones that match today are best)',
  'Play at least one game on Chess.com',
  'Share one line in the WhatsApp group',
]

function partCards(content: DayContent, part: Part): Card[] {
  return part === 'core' ? content.core : part === 'deeper' ? content.deeper : []
}

function notice(title: string, text: string, ...extra: Node[]): HTMLElement {
  return h('section', { class: 'screen' }, h('h1', null, title), h('p', { class: 'lead' }, text), ...extra)
}

function saveBanner(): HTMLElement | null {
  if (store.canSave()) return null
  return h(
    'p',
    { class: 'banner warn', role: 'status' },
    'Heads up: this browser will not remember your progress. If you close the page you will start the day again. Opening the link in Chrome helps.',
  )
}

export async function mountDay(root: HTMLElement, day: number, current: () => boolean = () => true): Promise<void> {
  const home = button('All days', 'btn alt', () => (location.hash = '#/'))
  root.replaceChildren(loadingView(`Loading Day ${day}…`))

  const startMs = parseStart(course.startDate)
  const nowMs = getNow()
  const startedAt = store.getStartedAt()
  if (!dayOpen(day, { nowMs, startMs, startedAt, unlockAll: course.unlockAll, preview: isPreview() })) {
    const status = challengeStatus(nowMs, startMs, startedAt, TOTAL_DAYS)
    if (status.phase === 'ready') {
      // The challenge has begun, but this member has not tapped Start yet, so their days have no dates.
      root.replaceChildren(notice('Start the challenge first', 'Your Day 1 begins when you tap Start on the home page. After that, a new day opens every midnight, Kampala time.', home))
    } else {
      const at = unlockAt(status.start ?? startMs, day)
      root.replaceChildren(notice(`Day ${day} is not open yet`, `It opens on ${formatDate(at)} at midnight, Kampala time. Come back then.`, home))
    }
    return
  }

  let content: DayContent | null = null
  try {
    content = await loadDay(day)
    if (!current()) return
  } catch {
    root.replaceChildren(
      notice('Could not load this day', 'Your connection may have dropped. Check it and try again.', button('Try again', 'btn', () => void mountDay(root, day, current)), home),
    )
    return
  }
  if (!content) {
    root.replaceChildren(notice(`Day ${day} is coming soon`, 'This lesson is still being written. Check the days list for what is open.', home))
    return
  }
  const lesson: DayContent = content

  let part: Part = 'intro'
  let idx = 0
  const progress = () => store.getDay(day)

  const coreKeys = scoredKeys(lesson.core, 'c')

  function go(next: Part, to: number): void {
    part = next
    idx = to
    if (part !== 'intro') {
      store.update(day, (d) => {
        d.pos[part as 'core' | 'deeper'] = to
        if (part === 'core' && to >= lesson.core.length && !d.coreDone) d.coreDone = Date.now()
        if (part === 'deeper' && to >= lesson.deeper.length && !d.deeperDone) d.deeperDone = Date.now()
      })
    }
    render()
    window.scrollTo(0, 0)
  }

  function intro(): HTMLElement {
    const d = progress()
    const coreDone = !!d.coreDone
    const started = d.pos.core > 0 && !coreDone
    const rows = [
      ['Learn', `Core lesson, about 15 minutes (${lesson.core.length} steps)`],
      ['Puzzle', 'A few puzzles, ideally on today’s theme'],
      ['Play', 'One game on Chess.com'],
      ['Share', 'One line in the group. We write the message for you'],
    ]
    const list = h(
      'ol',
      { class: 'steps' },
      ...rows.map(([k, v]) => h('li', null, h('b', null, k), h('span', null, v))),
    )
    const actions = h('div', { class: 'stack' })
    if (!coreDone) {
      actions.append(button(started ? `Continue (step ${Math.min(d.pos.core + 1, lesson.core.length)})` : 'Start today’s lesson', 'btn', () => go('core', started ? d.pos.core : 0)))
    } else {
      actions.append(button('Today’s Grind and share', 'btn', () => go('core', lesson.core.length)))
      actions.append(button('Go through the lesson again', 'btn alt', () => go('core', 0)))
    }
    if (lesson.deeper.length && (coreDone || d.pos.deeper > 0)) {
      actions.append(button(d.deeperDone ? 'Go deeper again' : 'Go deeper (optional, about 15 min)', 'btn alt', () => go('deeper', d.deeperDone ? 0 : d.pos.deeper)))
    }
    actions.append(home)
    return h(
      'section',
      { class: 'screen intro' },
      h('p', { class: 'kicker' }, `Day ${lesson.day} · Level ${lesson.level}`),
      h('h1', null, lesson.title),
      h('p', { class: 'lead' }, lesson.blurb),
      saveBanner(),
      list,
      lesson.deeper.length ? h('p', { class: 'mute' }, `Go deeper, if you want more: ${lesson.deeperTitle}.`) : null,
      actions,
    )
  }

  function grindCard(): HTMLElement {
    const d = progress()
    const { right, total } = store.score(day, coreKeys)
    const noteBox = h('textarea', {
      rows: '3',
      maxlength: '240',
      'aria-label': lesson.share.prompt,
      placeholder: lesson.share.prompt,
    })
    noteBox.value = d.note
    const preview = h('textarea', { rows: '4', readonly: '', 'aria-label': 'Your message, ready to copy' })
    const result = h('p', { class: 'task-status', role: 'status', 'aria-live': 'polite' })
    const wa = h('a', { class: 'btn alt', target: '_blank', rel: 'noopener' }, 'Open WhatsApp with this message')

    const message = () =>
      buildMessage({ name: course.challengeName, day, right, total, note: noteBox.value, wentDeeper: store.isDeeperDone(day) })

    // The picture for the group: drawn on this phone from the same facts as the message.
    const pic = h('img', { class: 'share-pic', alt: 'Your progress picture for the group', width: '1080', height: '1350' }) as HTMLImageElement
    const picBox = h('div', { class: 'share-pic-box' }, pic)
    picBox.hidden = true
    const savePic = h('a', { class: 'btn alt' }, 'Save the picture') as HTMLAnchorElement
    savePic.hidden = true
    let png: Blob | null = null
    let picUrl = ''
    let drawing = 0
    let drawTimer = 0
    let maker: typeof import('../lib/shareCard') | null = null
    const fileName = pictureName(course.challengeName, day)

    async function makePicture(): Promise<Blob | null> {
      const mine = ++drawing
      try {
        maker = maker ?? (await import('../lib/shareCard'))
        const blob = await maker.renderShareCard({
          name: course.challengeName,
          day,
          totalDays: TOTAL_DAYS,
          title: lesson.title,
          level: lesson.level,
          right,
          total,
          wentDeeper: store.isDeeperDone(day),
          done: Array.from({ length: TOTAL_DAYS }, (_, k) => k + 1 === day || store.isCoreDone(k + 1)),
          note: noteBox.value,
          dateText: formatDate(getNow()),
          host: maker.footerHost(location.hostname),
        })
        if (mine !== drawing) return png
        png = blob
        if (picUrl) URL.revokeObjectURL(picUrl)
        picUrl = URL.createObjectURL(blob)
        pic.src = picUrl
        pic.alt = `Your progress picture: ${message().replace(/\n/g, ', ')}`
        picBox.hidden = false
        savePic.href = picUrl
        savePic.download = fileName
        savePic.hidden = false
        return blob
      } catch {
        // No canvas, or the picture code could not load (offline on first use): the text message still works.
        if (mine === drawing) {
          png = null
          picBox.hidden = true
          savePic.hidden = true
        }
        return null
      }
    }

    const sync = () => {
      const m = message()
      preview.value = m
      wa.setAttribute('href', waLink(m))
    }
    noteBox.addEventListener('input', () => {
      store.update(day, (x) => (x.note = noteBox.value))
      sync()
      window.clearTimeout(drawTimer)
      drawTimer = window.setTimeout(() => void makePicture(), 350)
    })
    preview.addEventListener('focus', () => preview.select())
    sync()
    void makePicture()

    const shareTextOnly = button('Share the text only', 'btn alt', async () => {
      const out = await shareText(message())
      result.textContent =
        out === 'shared' ? 'Shared. Look for it in the group.' : out === 'copied' ? 'Copied. Paste it into the group chat.' : out === 'cancelled' ? 'Share cancelled.' : 'Could not copy automatically. Press and hold the message above to copy it, or use the WhatsApp button.'
    })

    const share = button('Share the picture', 'btn', async () => {
      const blob = png ?? (await makePicture())
      if (!blob) {
        result.textContent = 'Could not make the picture on this phone, so sharing the text instead.'
        shareTextOnly.click()
        return
      }
      const out = await shareImage(blob, fileName, message())
      if (out === 'shared') result.textContent = 'Shared. Look for it in the group.'
      else if (out === 'cancelled') result.textContent = 'Share cancelled.'
      else {
        // This browser cannot send pictures straight to WhatsApp (most computers): save it and copy the message.
        savePic.click()
        void navigator.clipboard?.writeText(message()).catch(() => undefined)
        result.textContent = 'Picture saved. Open the WhatsApp group, attach it, and paste your message (we copied it).'
      }
    })

    const habits = h(
      'ul',
      { class: 'habits' },
      ...HABITS.map((label, i) => {
        const box = h('input', { type: 'checkbox', id: `habit-${i}` })
        box.checked = !!d.habits[i]
        box.addEventListener('change', () => store.update(day, (x) => (x.habits[i] = box.checked)))
        return h('li', null, box, h('label', { for: `habit-${i}` }, label))
      }),
    )

    const scoreLine =
      total > 0
        ? h('p', { class: 'score' }, h('b', null, `${right} of ${total}`), ' right first time')
        : null

    return h(
      'article',
      { class: 'card card-grind' },
      h('p', { class: 'kicker' }, 'Today’s Grind'),
      h('h2', null, `Day ${lesson.day} lesson done. Nice work.`),
      scoreLine,
      h('p', null, 'Three habits make the day count:'),
      habits,
      h('h3', null, 'Share it with the group'),
      h('p', { class: 'mute' }, 'One line is enough. Say what you learned, a win, or a blunder you survived. We turn your result into a picture for the group.'),
      noteBox,
      picBox,
      share,
      savePic,
      h('p', { class: 'mute small-label' }, 'Your message (it goes with the picture)'),
      preview,
      shareTextOnly,
      wa,
      result,
    )
  }

  function closing(): HTMLElement {
    if (part === 'core') {
      const box = h('div', { class: 'stack' })
      if (lesson.deeper.length) {
        box.append(button(`Go deeper (optional, about 15 min)`, 'btn', () => go('deeper', progress().pos.deeper >= lesson.deeper.length ? 0 : progress().pos.deeper)))
        box.append(h('p', { class: 'mute' }, lesson.deeperTitle + '.'))
      }
      box.append(home)
      return h('div', { class: 'narrow' }, saveBanner(), grindCard(), box)
    }
    return h(
      'section',
      { class: 'screen' },
      h('p', { class: 'kicker' }, 'Go deeper'),
      h('h1', null, 'You went the extra mile'),
      h('p', { class: 'lead' }, 'That was the optional part, so it is a bonus. Update your message so the group knows.'),
      h(
        'div',
        { class: 'stack' },
        button('Back to Today’s Grind', 'btn', () => go('core', lesson.core.length)),
        home,
      ),
    )
  }

  let footer: HTMLElement | null = null
  let nextBtn: HTMLButtonElement | null = null
  let view: CardView | null = null

  function updateFooter(): void {
    if (nextBtn && view) nextBtn.disabled = !view.isDone()
  }

  function bar(cards: Card[]): HTMLElement {
    const total = cards.length
    const here = Math.min(idx + 1, total)
    const label = part === 'core' ? `Day ${lesson.day} · Core` : `Day ${lesson.day} · Go deeper`
    const pct = Math.round((Math.min(idx, total) / total) * 100)
    const back = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Back to all days' }, '‹')
    back.addEventListener('click', () => (location.hash = '#/'))
    return h(
      'header',
      { class: 'lesson-bar' },
      back,
      h('div', { class: 'lesson-bar-main' }, h('span', { class: 'lesson-title' }, label), h('span', { class: 'lesson-step' }, idx < total ? `${here} / ${total}` : 'Done')),
      themeButton(),
      h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(Math.min(idx, total)) }, h('i', { style: `width:${pct}%` })),
    )
  }

  function render(): void {
    const d = progress()
    view = null
    footer = null
    nextBtn = null
    // While a lesson is on screen the page header gives way to the lesson bar (which has its own theme button).
    if (part === 'intro') delete document.body.dataset.lesson
    else document.body.dataset.lesson = '1'
    if (part === 'intro') {
      root.replaceChildren(intro())
      return
    }
    const cards = partCards(lesson, part)
    const prefix = part === 'core' ? 'c' : 'd'
    if (idx >= cards.length) {
      root.replaceChildren(bar(cards), h('div', { class: 'stage' }, closing()))
      return
    }
    const key = `${prefix}${idx}`
    view = renderCard(cards[idx], {
      key,
      results: d.res,
      save: (k, res) => store.update(day, (x) => (x.res[k] = res)),
      notify: updateFooter,
    })
    const last = idx === cards.length - 1
    nextBtn = button(last ? (part === 'core' ? 'Finish' : 'Finish') : 'Next', 'btn', () => go(part, idx + 1))
    const back = button('Back', 'btn alt', () => (idx === 0 ? go('intro', 0) : go(part, idx - 1)))
    footer = h('footer', { class: 'lesson-foot' }, back, nextBtn)
    updateFooter()
    root.replaceChildren(bar(cards), h('div', { class: 'stage' }, view.el), footer)
  }

  render()
}

