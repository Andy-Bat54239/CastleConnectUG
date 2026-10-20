import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function stubDom() {
  const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> }
  vi.stubGlobal('document', { documentElement: root })
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
  return root
}

async function freshTheme() {
  vi.resetModules()
  return await import('../src/lib/theme')
}

describe('theme', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('is light by default, whatever the phone is set to', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('dark') })) // a phone set to dark
    const t = await freshTheme()
    expect(t.loadTheme()).toBe('light')
    expect(t.getTheme()).toBe('light')
  })

  it('restores a saved dark choice', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'dark', setItem: () => {} })
    const t = await freshTheme()
    expect(t.loadTheme()).toBe('dark')
  })

  it('ignores a corrupt saved value', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'purple', setItem: () => {} })
    const t = await freshTheme()
    expect(t.loadTheme()).toBe('light')
  })

  it('falls back to light when storage is blocked', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const t = await freshTheme()
    expect(t.loadTheme()).toBe('light')
    const root = stubDom()
    expect(() => t.setTheme('dark')).not.toThrow() // still switches for this visit
    expect(root.dataset.theme).toBe('dark')
  })

  it('toggles, applies to the page and remembers the choice', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
    const root = stubDom()
    const t = await freshTheme()
    t.applyTheme('light')
    expect(root.dataset.theme).toBe('light')
    expect(t.toggleTheme()).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
    expect(store.get('bg:theme')).toBe('dark')
    expect(t.toggleTheme()).toBe('light')
    expect(store.get('bg:theme')).toBe('light')
  })

  it('does not wipe the theme when progress is reset', async () => {
    const store = new Map<string, string>([['bg:theme', 'dark']])
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
    vi.resetModules()
    const s = await import('../src/lib/store')
    s.resetAll()
    expect(store.get('bg:theme')).toBe('dark')
  })
})
