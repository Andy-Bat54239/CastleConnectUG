import { getTheme, toggleTheme } from '../lib/theme'
import { h } from './dom'

const ATTRS = 'viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"'
const MOON = `<svg ${ATTRS}><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg>`
const SUN = `<svg ${ATTRS}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`

function paint(b: Element): void {
  const dark = getTheme() === 'dark'
  // The icon shows where a tap takes you: a moon in light mode, a sun in dark mode.
  b.innerHTML = dark ? SUN : MOON
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  b.setAttribute('aria-label', label)
  b.setAttribute('title', label)
}

// One listener repaints every theme button on the page, however many screens have been built.
window.addEventListener('bg-theme', () => document.querySelectorAll('.theme-btn').forEach(paint))

/** A sun/moon button. Pass a class to place or colour it (for example "on-bar"). */
export function themeButton(extraClass = ''): HTMLButtonElement {
  const b = h('button', { type: 'button', class: ('theme-btn ' + extraClass).trim() })
  paint(b)
  b.addEventListener('click', () => toggleTheme())
  return b
}
