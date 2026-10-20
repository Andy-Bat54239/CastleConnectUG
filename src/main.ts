import './styles.css'
import { installSprite } from './ui/pieces'
import { mountHome } from './ui/home'
import { applyTheme, loadTheme } from './lib/theme'
import { themeButton } from './ui/themeButton'
import { hostBadgeShown } from './lib/hostBadge'
import { button, h } from './ui/dom'
import { TOTAL_DAYS } from './lib/content'
import { startTracking } from './lib/tracker'

const root = document.getElementById('app') as HTMLElement

declare global {
  interface Window {
    /** Set by the loading screen in index.html; call it once the first screen is on the page. */
    __bgReady?: () => void
  }
}
const ready = () => window.__bgReady?.()

/** A screen's code could not be fetched (usually a dropped connection on first use). */
function loadFailed(): void {
  root.replaceChildren(
    h('section', { class: 'screen' }, h('h1', null, 'Could not load this page'), h('p', { class: 'lead' }, 'Your connection may have dropped. Check it and try again.'), button('Try again', 'btn', () => location.reload())),
  )
}

let routeId = 0

function route(): void {
  const id = ++routeId
  const current = () => id === routeId // a newer navigation makes older, slower screens give up
  const hash = location.hash || '#/'
  const m = hash.match(/^#\/(day|review)\/(\d+)/)
  document.body.dataset.route = m ? m[1] : hash === '#/dev' ? 'dev' : 'home'
  delete document.body.dataset.lesson // the lesson screen sets this again while a lesson is on screen
  window.scrollTo(0, 0)
  if (m && m[1] === 'day') {
    void import('./ui/day')
      .then((x) => {
        void x.mountDay(root, Number(m[2]), current)
      })
      .catch(loadFailed)
      .finally(ready)
  } else if (m && m[1] === 'review') {
    void import('./ui/review')
      .then((x) => {
        void x.mountReview(root, Number(m[2]), current)
      })
      .catch(loadFailed)
      .finally(ready)
  } else if (import.meta.env.DEV && hash === '#/dev') {
    void import('./ui/dev')
      .then((x) => x.mountDev(root))
      .catch(loadFailed)
      .finally(ready)
  } else {
    mountHome(root)
    ready()
  }
}

installSprite()
// A host badge in the bottom-right corner (Netlify's free plan) would sit on top of the Next button.
if (hostBadgeShown(document)) document.documentElement.classList.add('host-badge')
applyTheme(loadTheme())
document.getElementById('theme-slot')?.append(themeButton('on-bar'))
window.addEventListener('hashchange', route)
route()
// Anonymous player counts (no names): see src/lib/tracker.ts. Test links and the dev server are never counted.
startTracking(TOTAL_DAYS, location.search, import.meta.env.DEV)

// Offline support. Skipped quietly where in-app browsers do not offer service workers.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
