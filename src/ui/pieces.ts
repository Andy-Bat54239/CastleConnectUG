/**
 * Chess pieces drawn for Castle Connect: simple, chunky silhouettes that stay readable at phone size.
 * One <symbol> per piece, shared by every board through <use>. Fill and line colours come from the
 * CSS variables --pc-fill and --pc-line, set per side in styles.css (.pc-w / .pc-b).
 * Original artwork, so there is no third-party licence to track.
 */

const P = 'fill="var(--pc-fill)" stroke="var(--pc-line)" style="stroke-width:var(--pc-sw,1.6)" stroke-linejoin="round" stroke-linecap="round"'
const L = 'fill="none" stroke="var(--pc-line)" style="stroke-width:var(--pc-sw,1.4)" stroke-linecap="round" stroke-linejoin="round"'

const base = (y = 35) => `<path ${P} d="M11.5 ${y + 4}h22v-3.2c0-1.1-.9-2-2-2h-18c-1.1 0-2 .9-2 2z"/>`

const SHAPES: Record<string, string> = {
  p: `
    <circle ${P} cx="22.5" cy="13.2" r="5.4"/>
    <path ${P} d="M17.2 22.8h10.6c1.8 2.4 4.4 6.2 4.4 11.4H12.8c0-5.2 2.6-9 4.4-11.4z"/>
    ${base(35)}`,
  r: `
    <path ${P} d="M12.5 8.5h4.6v3.2h3.1V8.5h4.6v3.2h3.1V8.5h4.6v8.7c0 1.2-.7 2.1-1.7 2.5l1.1 12.6H13.1l1.1-12.6c-1-.4-1.7-1.3-1.7-2.5z"/>
    <path ${L} d="M14.8 18.2h15.4"/>
    ${base(35)}`,
  n: `
    <path ${P} d="M13.2 35.2c-.4-6.6 2.6-10.6 6.2-13.2-2.6.3-4.8 1.6-6.4 3.6-1.3-.6-2.3-1.9-1.9-3.6.5-2.2 2.7-3.6 4.6-6.5 1.1-1.7 1.6-3.7 1.5-5.4l2.6 1.5c1.8-1.1 4-1.3 6.2-.4 6.2 2.6 9.4 9.4 9.2 19.6z"/>
    <circle cx="19.2" cy="15.6" r="1.25" fill="var(--pc-line)"/>
    <path ${L} d="M11.7 22.9c.9-.3 1.9-.2 2.7.2"/>
    ${base(35)}`,
  b: `
    <circle ${P} cx="22.5" cy="8.4" r="2.7"/>
    <path ${P} d="M22.5 11.2c5.6 4.6 7.2 9.4 3.6 13.2 2.2 1.5 5 4.6 4.8 10.8H14.1c-.2-6.2 2.6-9.3 4.8-10.8-3.6-3.8-2-8.6 3.6-13.2z"/>
    <path ${L} d="M19.6 17.8l5.8 5.4"/>
    ${base(35)}`,
  q: `
    <path ${P} d="M10.2 13.4l4.2 12.6 3.1-14.2 3.7 13.4 1.3-15.2 1.3 15.2 3.7-13.4 3.1 14.2 4.2-12.6c.6 1.6.5 4.1-.2 6.3l-1.7 13.9H12.1L10.4 19.7c-.7-2.2-.8-4.7-.2-6.3z"/>
    <circle ${P} cx="10.2" cy="11.6" r="2.1"/>
    <circle ${P} cx="17.4" cy="9.4" r="2.1"/>
    <circle ${P} cx="22.5" cy="8.4" r="2.1"/>
    <circle ${P} cx="27.6" cy="9.4" r="2.1"/>
    <circle ${P} cx="34.8" cy="11.6" r="2.1"/>
    <path ${L} d="M13.2 31.4h18.6"/>
    ${base(35)}`,
  k: `
    <path ${P} d="M20.5 2.8h4v3.2h3.4v4h-3.4v2.4h-4V10h-3.4V6h3.4z"/>
    <path ${P} d="M22.5 14.4c-5 0-8 2.6-8 6.2 0 2.3 1 3.8 2.6 4.8-3 2-5.2 5.2-4.6 10h20c.6-4.8-1.6-8-4.6-10 1.6-1 2.6-2.5 2.6-4.8 0-3.6-3-6.2-8-6.2z"/>
    <path ${L} d="M16.6 26h11.8"/>
    ${base(35)}`,
}

/** Markup for a hidden <svg> holding every piece symbol: ids wp, wn, ... bk. */
export function spriteMarkup(): string {
  let out = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>'
  for (const k of Object.keys(SHAPES)) {
    // Both sides use the same silhouette; colours differ via CSS variables on .pc-w / .pc-b.
    out += `<symbol id="pc-${k}" viewBox="5.5 2 34 38">${SHAPES[k]}</symbol>`
  }
  return out + '</defs></svg>'
}

export function installSprite(): void {
  if (document.getElementById('pc-p')) return
  const holder = document.createElement('div')
  holder.innerHTML = spriteMarkup()
  document.body.prepend(holder.firstElementChild as Element)
}

const NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

/** Name for screen readers, from a FEN letter: "R" -> "white rook". */
export function pieceName(letter: string): string {
  const white = letter === letter.toUpperCase()
  return `${white ? 'white' : 'black'} ${NAMES[letter.toLowerCase()]}`
}
