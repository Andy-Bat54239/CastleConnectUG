import { course, curriculum, hasDay, TOTAL_DAYS } from '../lib/content'
import * as store from '../lib/store'
import { currentDay, dayOpen, formatDate, getNow, isPreview, parseStart, unlockAt } from '../lib/time'
import { button, h } from './dom'

const PARTS: [string, string][] = [
  ['Learn', 'A short interactive lesson'],
  ['Puzzle', 'A few puzzles to sharpen it'],
  ['Play', 'One game on Chess.com'],
  ['Share', 'One line in the WhatsApp group'],
]

export function mountHome(root: HTMLElement): void {
  const startMs = parseStart(course.startDate)
  const now = getNow()
  const unlockAll = !!course.unlockAll
  const isOpenDay = (day: number) => dayOpen(day, { nowMs: now, startMs, unlockAll, preview: isPreview() })
  // With a date-locked challenge "today" is the calendar day. With everything open there is no
  // "today", so we point at the first lesson that is written and not finished yet.
  const next = curriculum.find((e) => hasDay(e.day) && !store.isCoreDone(e.day))?.day ?? 0
  const today = unlockAll ? next : currentDay(now, startMs, TOTAL_DAYS)
  const done = store.doneCount()

  // The headline: what should I do right now?
  const hero = h('section', { class: 'hero' })
  if (unlockAll) {
    if (today > 0) {
      const entry = curriculum[today - 1]
      const started = store.getDay(today).pos.core > 0
      hero.append(
        h('p', { class: 'kicker' }, `${started ? 'Pick up where you left off' : 'Up next'} · Day ${today} of ${TOTAL_DAYS}`),
        h('h1', null, entry.title),
        h('p', { class: 'lead' }, 'All the days are open, so go at your own pace. About fifteen minutes a day: learn, solve, play, then share one line.'),
        button(started ? 'Continue the lesson' : 'Start the lesson', 'btn', () => (location.hash = `#/day/${today}`)),
      )
    } else {
      hero.append(
        h('p', { class: 'kicker' }, 'All caught up'),
        h('h1', null, `You have finished ${done} lesson${done === 1 ? '' : 's'} so far`),
        h('p', { class: 'lead' }, 'More days are on the way. Go back through any lesson whenever you like.'),
      )
    }
  } else if (today === 0) {
    hero.append(
      h('p', { class: 'kicker' }, 'Starting soon'),
      h('h1', null, 'The Bridge Grind starts ' + formatDate(startMs)),
      h('p', { class: 'lead' }, 'Fourteen days. About fifteen minutes a day. Day 1 opens at midnight, Kampala time. Have a look around until then.'),
    )
  } else if (today > TOTAL_DAYS) {
    hero.append(
      h('p', { class: 'kicker' }, 'Challenge complete'),
      h('h1', null, `You finished ${done} of ${TOTAL_DAYS} days`),
      h('p', { class: 'lead' }, 'Every day stays open. Go back to any lesson whenever you like.'),
    )
  } else {
    const entry = curriculum[today - 1]
    const finished = store.isCoreDone(today)
    hero.append(
      h('p', { class: 'kicker' }, `Today · Day ${today} of ${TOTAL_DAYS}`),
      h('h1', null, entry.title),
      h('p', { class: 'lead' }, finished ? 'Today’s lesson is done. Well played. Share it with the group if you have not yet.' : 'About fifteen minutes. Learn, solve, play, then share one line.'),
    )
    if (hasDay(today)) hero.append(button(finished ? 'Open today' : store.getDay(today).pos.core > 0 ? 'Continue today’s lesson' : 'Start today’s lesson', 'btn', () => (location.hash = `#/day/${today}`)))
  }

  const dots = h(
    'div',
    { class: 'track', role: 'img', 'aria-label': `${done} of ${TOTAL_DAYS} days done` },
    ...curriculum.map((e) => {
      const open = isOpenDay(e.day)
      const cls = 'pip' + (store.isCoreDone(e.day) ? ' done' : open ? ' open' : '') + (e.day === today ? ' now' : '')
      return h('span', { class: cls }, String(e.day))
    }),
  )

  const list = h('ol', { class: 'days' })
  for (const e of curriculum) {
    const open = isOpenDay(e.day)
    const ready = hasDay(e.day)
    const coreDone = store.isCoreDone(e.day)
    let tag = ''
    let tagCls = 'tag'
    if (coreDone) {
      tag = store.isDeeperDone(e.day) ? 'Done + deeper' : 'Done'
      tagCls += ' done'
    } else if (!open) {
      tag = 'Opens ' + formatDate(unlockAt(startMs, e.day))
      tagCls += ' lock'
    } else if (!ready) {
      tag = 'Coming soon'
      tagCls += ' lock'
    } else {
      tag = e.day === today ? (unlockAll ? 'Up next' : 'Today') : 'Open'
      tagCls += ' open'
    }
    const body = [
      h('span', { class: 'day-num' }, String(e.day)),
      h('span', { class: 'day-main' }, h('b', null, e.title), h('span', { class: 'mute' }, `Level ${e.level}`)),
      h('span', { class: tagCls }, tag),
    ]
    const clickable = open && ready
    const li = h('li', null, clickable ? h('a', { class: 'day-row', href: `#/day/${e.day}` }, ...body) : h('div', { class: 'day-row off' }, ...body))
    list.append(li)
  }

  const how = h(
    'section',
    { class: 'how' },
    h('h2', null, 'How each day works'),
    h('ol', { class: 'steps' }, ...PARTS.map(([k, v]) => h('li', null, h('b', null, k), h('span', null, v)))),
    h('p', { class: 'mute' }, 'No sign-up, no password. Your progress stays on this phone, and the WhatsApp group is where we see each other’s.'),
  )

  const reset = button('Reset my progress on this phone', 'link-btn', () => {
    if (window.confirm('Clear your progress on this phone? This cannot be undone.')) {
      store.resetAll()
      mountHome(root)
    }
  })

  const warn = store.canSave() ? [] : [h('p', { class: 'banner warn', role: 'status' }, 'This browser will not remember your progress. Opening the link in Chrome usually fixes it.')]
  // On wide screens the hero and guide sit on the left and the days on the right (see styles.css).
  const daysBlock = h('div', { class: 'home-days' }, h('h2', { class: 'section-title' }, 'The 14 days'), list)
  root.replaceChildren(h('div', { class: 'home' }, hero, ...warn, dots, daysBlock, how, reset))
}
