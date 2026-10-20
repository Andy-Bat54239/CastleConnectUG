import { course, curriculum, hasDay, TOTAL_DAYS } from '../lib/content'
import * as store from '../lib/store'
import { challengeStatus, dayOpen, DAY_MS, formatDate, getNow, isPreview, kampalaMidnight, parseStart, unlockAt } from '../lib/time'
import { button, h } from './dom'

const PARTS: [string, string][] = [
  ['Learn', 'A short interactive lesson'],
  ['Puzzle', 'A few puzzles to sharpen it'],
  ['Play', 'One game on Chess.com'],
  ['Share', 'One line in the WhatsApp group'],
]

/**
 * "Started earlier?": for a member whose browser forgot when they began, or who started on another phone. They pick the
 * day they tapped Start and their days are counted from it. Changing this only cheats yourself, like the phone clock.
 */
function startedEarlier(root: HTMLElement, cohortMs: number, now: number): HTMLElement {
  const today = kampalaMidnight(now)
  const first = Math.max(cohortMs, today - TOTAL_DAYS * DAY_MS)
  const select = h('select', { 'aria-label': 'The day you tapped Start' }, h('option', { value: '' }, 'Choose a day…'))
  for (let t = first; t <= today; t += DAY_MS) select.append(h('option', { value: String(t) }, formatDate(t) + (t === today ? ' (today)' : '')))
  const msg = h('p', { class: 'mute', role: 'status' })
  const panel = h(
    'div',
    { class: 'earlier', hidden: '' },
    h('p', null, 'Pick the day you first tapped Start. Your days will be counted from it.'),
    select,
    button('Use this day', 'btn alt sm', () => {
      if (!select.value) {
        msg.textContent = 'Choose a day first.'
        return
      }
      store.setStartedAt(Number(select.value))
      mountHome(root)
    }),
    msg,
  )
  const toggle = button('Started earlier? Tell us which day', 'link-btn', () => {
    panel.toggleAttribute('hidden')
  })
  return h('div', null, toggle, panel)
}

export function mountHome(root: HTMLElement): void {
  const startMs = parseStart(course.startDate) // the shared start of the challenge, for the whole group
  const now = getNow()
  const unlockAll = !!course.unlockAll
  const startedAt = store.getStartedAt()
  const status = challengeStatus(now, startMs, startedAt, TOTAL_DAYS)
  const isOpenDay = (day: number) => dayOpen(day, { nowMs: now, startMs, startedAt, unlockAll, preview: isPreview() })
  // With a date-locked challenge "today" is the member's own day, counted from the day they tapped Start. With everything
  // open there is no "today", so we point at the first lesson that is written and not finished yet.
  const next = curriculum.find((e) => hasDay(e.day) && !store.isCoreDone(e.day))?.day ?? 0
  const today = unlockAll ? next : status.day
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
  } else if (status.phase === 'before') {
    hero.append(
      h('p', { class: 'kicker' }, 'Starting soon'),
      h('h1', null, 'The Bridge Grind starts ' + formatDate(startMs)),
      h('p', { class: 'lead' }, 'Fourteen days. About fifteen minutes a day. Day 1 opens at midnight, Kampala time, and your days are counted from the day you tap Start. Have a look around until then.'),
    )
  } else if (status.phase === 'ready') {
    hero.append(
      h('p', { class: 'kicker' }, 'Ready when you are'),
      h('h1', null, 'Start your 14 days'),
      h('p', { class: 'lead' }, 'Day 1 begins when you tap Start. After that, a new day opens every midnight, Kampala time. About fifteen minutes a day: learn, solve, play, then share one line.'),
      button('Start the challenge', 'btn', () => {
        store.markStarted(getNow())
        location.hash = '#/day/1'
      }),
      startedEarlier(root, startMs, now),
    )
  } else if (status.phase === 'over') {
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
      // Before the shared start every date follows the group's. After it, a member's dates begin when they tap Start.
      tag = status.start !== null ? 'Opens ' + formatDate(unlockAt(status.start, e.day)) : status.phase === 'before' ? 'Opens ' + formatDate(unlockAt(startMs, e.day)) : 'Locked'
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
  const began = !unlockAll && status.start !== null ? [h('p', { class: 'mute' }, `Your Day 1 was ${formatDate(status.start)}. A new day opens every midnight, Kampala time.`)] : []
  const daysBlock = h('div', { class: 'home-days' }, h('h2', { class: 'section-title' }, 'The 14 days'), ...began, list)
  root.replaceChildren(h('div', { class: 'home' }, hero, ...warn, dots, daysBlock, how, reset))
}
