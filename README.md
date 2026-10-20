# Bridge Grind

A 14-day chess learning challenge for Castle Connect UG. A static website: no accounts, no
database, nothing to sign in to. Progress lives on each member's phone, and the WhatsApp group is
where everyone sees each other's.

**Status:** Phase 1 (foundation). The app, board, content schema and validator are built, and
Days 1 to 3 are written and playable. Days 4 to 14 are not written yet.

## Run it

Needs a current Node.js: 22.12 or newer (built and tested on Node 24).

```bash
npm install
npm run dev        # local site with live reload
npm test           # unit tests, including tests that the validator rejects bad chess
npm run validate   # check every lesson (also runs before each build)
npm run build      # validate + typecheck + build into dist/
npm run preview    # serve the built site, with the offline service worker
```

### Preview links (for Joel and testers)

Add these to the address. They only affect the page you opened, so they are safe to share.

| Add to the link | What it does |
| --- | --- |
| `?preview=1` | Opens every day, ignoring the unlock dates. |
| `?now=2026-10-28T09:00:00%2B03:00` | Pretends it is that moment in Kampala. |
| `#/review/3` | A read-through page for Day 3: every card, the right answers, and the explanations. Made for reviewing content without reading JSON. |

Example: `https://your-site/?preview=1#/review/3`

## Set the start date

Edit `content/config.json`:

```json
{ "startDate": "2026-10-26T00:00:00+03:00", "challengeName": "Bridge Grind" }
```

Day 1 opens at midnight Kampala time on that date, and each later day opens 24 hours after the
one before. The date **must end in `+03:00`**; the validator checks. (Kampala has no daylight
saving, so a fixed offset is exact.) The sample date `2026-10-26` is a placeholder. Joel to decide.

## Edit or add lessons

Lessons are plain JSON files in `content/`, one per day (`day-01.json`, ...). See
[`content/README.md`](content/README.md) for the card types, examples and authoring helpers.
Every build runs the **validator**, which refuses to ship a lesson with a wrong position, an
illegal move, a false "checkmate" claim or a mistyped field.

## How it is built

| Piece | Choice | Why |
| --- | --- | --- |
| Site | Vite + TypeScript, no UI framework | Tiny output; nothing to learn to maintain it. |
| Chess rules | [chess.js](https://github.com/jhlywa/chess.js) (BSD-2) | Move legality, checkmate detection. Permissive licence. |
| Board and pieces | Own code and own SVG artwork | No GPL board library; no third-party artwork licence. |
| Routing | `#/day/3` style hash links | Works on any static host and inside WhatsApp's browser, no server rules. |
| Moving pieces | Drag a piece, or tap it and tap where it goes | Both work on every device (one code path: pointer events). A press that barely moves is a tap; one that travels is a drag, with a ghost piece that rides above a finger so it is not hidden. Only squares holding a piece stop page scrolling, and only on boards where dragging is on. Escape cancels a drag. |
| Progress | `localStorage`, wrapped in try/catch, in-memory fallback | In-app browsers sometimes block storage; the app warns instead of breaking. |
| Time | Fixed UTC+3 arithmetic, no `Intl` | Exact for Kampala and works in every in-app browser. |
| Theme | Light by default; dark is a switch the member turns on | The phone's own light/dark setting is ignored. The sun/moon button is in the header and in the lesson bar, and the choice is remembered. A tiny script in `index.html` applies it before the first paint so there is no flash. |
| Offline | Small service worker | App shell is cached on first visit; each lesson is cached the first time it is opened. |

**Weight.** The home screen needs about 10 KB gzipped (plus a 9 KB logo). Opening a day adds
about 24 KB (the chess logic and that day's lesson). The brief's target was under 300 KB.

**Screen sizes.** One design, three layouts, all tested from 320px phones to 1920px monitors
(no sideways scrolling anywhere):

| Width | Layout |
| --- | --- |
| Phone, under 720px | One column, large tap targets, the board fills the width. |
| Tablet, 720px and up | A wider centred column and a bigger board. |
| Computer, 1000px and up | Home is two columns (guide on the left, the 14 days on the right). Lesson cards with a board put the board on the left and the question, answers and feedback on the right. The board's size follows the window height so a card fits on a short laptop screen. Mouse hover effects appear. |

**Browser support.** The scripts need Chrome 67 or newer (mid-2018), Safari 14+ or Firefox 68+,
because chess.js uses BigInt. A few newer style features (`color-mix`, `clamp`, `aspect-ratio`)
each have a plain fallback, so an older phone loses only a tint or a label size, not the
layout. `tests/css.test.ts` fails if someone adds one without a fallback.

### Layout

```
content/            lesson JSON, index.json (the 14 titles), config.json (start date)
scripts/
  validate-content.ts   the content validator (runs before every build)
  probe.ts              authoring helper: facts about a position
  line.ts               authoring helper: moves -> FEN
  sw-template.js        service worker template (filled in at build time)
src/
  lib/              time, store, share, chess helpers (no DOM, easy to test)
  ui/               board, cards, move/spot tasks, home, lesson, review screens
  styles.css        design tokens and styles (light + dark)
public/             icons, manifest, _headers
tests/              vitest suite
```

## Deploy (Netlify)

The repository includes `netlify.toml`, so Netlify needs no manual build settings: it runs
`npm run build` (which checks every lesson first), publishes `dist/`, and uses Node 22.

1. Netlify, **Add new site**, **Import an existing project**, choose GitHub, pick this repository.
2. Leave the build settings as they are (they come from `netlify.toml`) and deploy.
3. Every push to `main` redeploys automatically. A bad lesson fails the build, so it never goes live.
4. Optional: **Site configuration, Change site name** for a friendlier address than the random one.
   Netlify serves HTTPS automatically, which the offline mode and "add to home screen" need.

Leave the Netlify **Asset optimization** options off, and do not set `NODE_ENV=production` for the
build (it would skip the dev tools the build uses).

Without GitHub: run `npm install && npm run build`, then drag the `dist` folder onto
https://app.netlify.com/drop. Do it again to update.

After a deploy, open the link once, then check `/?preview=1#/day/1` and `/?preview=1#/review/1`.
The file `public/_headers` makes Netlify re-check the page and service worker on every visit (so
lesson fixes reach members promptly) and cache the fingerprinted files for a year.

**Never publish the parent folder.** This project lives in `bridge-grind/`. The folder around it holds
the source book PDF and working files that must not go on the internet.

## Before launch: test on real phones

These could not be tested in this build environment and need a real Android phone, opening the
link **from inside WhatsApp**:

- [ ] The page loads and is styled; the board shows pieces.
- [ ] Progress survives closing WhatsApp and tapping the link again (some in-app browsers block storage; the page shows a warning if so).
- [ ] "Share my progress" opens the phone's share menu; if not, that it copies; if not, the WhatsApp button works.
- [ ] Tapping and moving pieces feels right with a thumb, on the smallest phone you have. Try dragging too, and check that scrolling the page by swiping on empty squares still works.
- [ ] On a laptop and a tablet: the layout fills the screen sensibly and dragging and clicking pieces with a mouse both work.
- [ ] The sun/moon button switches modes, and the choice is still there after closing WhatsApp and reopening the link.
- [ ] "Add to home screen" and offline reopening (Chrome only; WhatsApp's browser may not offer it).
- [ ] The unlock dates show the right day around midnight Kampala time.

## Licences

Code: yours to choose; there is no third-party code beyond chess.js (BSD-2) and the dev tools
(Vite, Vitest, TypeScript, tsx; all MIT or Apache-2.0). Piece artwork: original. Logo and
colours: Castle Connect's own. The lessons are written in original words with original
positions; the source book is a reference only and nothing is copied from it.

**Puzzle data:** Days 1 to 3 use hand-built, machine-verified puzzles, not the Lichess
database. If we add Lichess puzzles later, confirm the licence at database.lichess.org first.
