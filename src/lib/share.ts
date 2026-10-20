export interface ShareInfo {
  name: string
  day: number
  right: number
  total: number
  note: string
  wentDeeper: boolean
}

/** The ready-made line members post in the WhatsApp group. */
export function buildMessage(i: ShareInfo): string {
  const lines = [`${i.name} · Day ${i.day} done ✅`]
  if (i.total > 0) lines.push(`Quiz: ${i.right}/${i.total} right`)
  if (i.wentDeeper) lines.push('Went deeper too 💪')
  lines.push(`One thing I learned: ${i.note.trim() || '…'}`)
  return lines.join('\n')
}

export function waLink(text: string): string {
  return 'https://wa.me/?text=' + encodeURIComponent(text)
}

export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'manual'

/**
 * Share chain from the brief: phone share menu, then clipboard, then old-style copy.
 * 'manual' means everything failed and the visible text box / WhatsApp button is the way.
 */
export async function shareText(text: string): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (e) {
      if (e && (e as { name?: string }).name === 'AbortError') return 'cancelled'
    }
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return 'copied'
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) return 'copied'
  } catch {
    /* fall through */
  }
  return 'manual'
}
