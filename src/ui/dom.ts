type Kid = Node | string | null | undefined | false

/** Tiny element builder. Strings become text nodes, so content can never inject HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string> | null,
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k])
  for (const kid of kids) if (kid) e.append(kid)
  return e
}

/** Text with **bold** support, built from text nodes (safe). */
export function rich(text: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  text.split('**').forEach((part, i) => {
    if (!part) return
    if (i % 2 === 1) frag.append(h('strong', null, part))
    else frag.append(part)
  })
  return frag
}

export function paragraphs(body: string | string[]): HTMLElement[] {
  return (Array.isArray(body) ? body : [body]).map((t) => {
    const p = h('p')
    p.append(rich(t))
    return p
  })
}

export function button(label: string, cls = 'btn', onClick?: () => void): HTMLButtonElement {
  const b = h('button', { type: 'button', class: cls }, label)
  if (onClick) b.addEventListener('click', onClick)
  return b
}
