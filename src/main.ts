import './styles.css'
import { installSprite } from './ui/pieces'
import { mountHome } from './ui/home'
import { applyTheme, loadTheme } from './lib/theme'
import { themeButton } from './ui/themeButton'

const root = document.getElementById('app') as HTMLElement

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
    void import('./ui/day').then((x) => x.mountDay(root, Number(m[2]), current))
  } else if (m && m[1] === 'review') {
    void import('./ui/review').then((x) => x.mountReview(root, Number(m[2]), current))
  } else if (import.meta.env.DEV && hash === '#/dev') {
    void import('./ui/dev').then((x) => x.mountDev(root))
  } else {
    mountHome(root)
  }
}

installSprite()
applyTheme(loadTheme())
document.getElementById('theme-slot')?.append(themeButton('on-bar'))
window.addEventListener('hashchange', route)
route()

// Offline support. Skipped quietly where in-app browsers do not offer service workers.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
