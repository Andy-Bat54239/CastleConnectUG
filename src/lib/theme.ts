/**
 * Light is the default for everyone. Dark is an opt-in the member can switch on, and the choice is
 * remembered on their phone. The phone's own light/dark setting is deliberately ignored.
 */
export type Theme = 'light' | 'dark'

const KEY = 'bg:theme'
let current: Theme = 'light'

/** The saved choice, or light. Storage can be blocked in in-app browsers, so every read is guarded. */
export function loadTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function getTheme(): Theme {
  return current
}

/** Show a theme without saving it. */
export function applyTheme(theme: Theme): void {
  current = theme
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('bg-theme'))
}

/** Show a theme and remember it (when the browser allows). */
export function setTheme(theme: Theme): void {
  applyTheme(theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* keeps the choice for this visit only */
  }
}

export function toggleTheme(): Theme {
  const next: Theme = current === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}
