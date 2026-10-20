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
| `?preview=1` | Opens every day for reading, ignoring the unlock dates and the Start button. |
| `?now=2026-10-28T09:00:00%2B03:00` | Pretends it is that moment in Kampala. |
| `#/review/3` | A read-through page for Day 3: every card, the right answers, and the explanations. Made for reviewing content without reading JSON. |

Example: `https://your-site/?preview=1#/review/3`

## How the days unlock

`content/config.json` holds the settings:

```json
{ "startDate": "2026-10-22T00:00:00+03:00", "challengeName": "Bridge Grind", "unlockAll": false }
```

- **`startDate` is the group's shared start.** It must end in `+03:00` (Kampala has no daylight saving, so a fixed offset
  is exact), and it should be midnight. Before this date the home screen says when the challenge starts and every day is
  locked.
- **Each member's Day 1 begins when they tap "Start the challenge".** Day 1 is the Kampala calendar day of the tap, and
  every following day opens at midnight, Kampala time, so tapping at 23:55 means Day 2 opens five minutes later. Someone
  who taps Start on the first day (22 Oct) is on the same day as the group. Someone who taps on 25 Oct gets their own
  14 days from 25 Oct. A tap before `startDate` cannot happen, because there is no Start button yet.
- **Where the start is kept.** On the member's own phone, next to their progress (`startedAt` in local storage). The
  first tap wins, and opening the link again never moves it. "Reset my progress on this phone" clears it too.
- **If a phone forgets.** A member whose browser was cleared, who switched phones or who opens the link in a different
  browser will see the Start button again. Under it, "Started earlier? Tell us which day" lets them pick the day they
  started, and their days are counted from that. (In a browser that blocks storage, the start cannot be remembered
  between visits, so the same link is how they pick it each time. The page already warns about such browsers.)
- **Changing the phone's clock** only cheats the person who does it, as before.
- `"unlockAll": true` opens every day at once, whatever the date, and the Start button is not needed. Use it for trying
  things out. `false` (or deleting the line) is the real challenge. Use `true` or `false` without quotes; the validator
  rejects anything else.

Change the file, commit and push, and Netlify redeploys. Everyone's own start stays on their phone, so changing
`startDate` later only affects members who have not started yet, and anyone whose start would fall before the new date.

To try it yourself: `?now=2026-10-22T09:00:00%2B03:00` pretends it is that moment (tap Start, and your Day 1 is that day),
`?preview=1` opens every day for reading, and "Reset my progress on this phone" at the bottom of the home page starts again.

## Counting players

The site counts how many people start, finish each day and go deeper, without names. Each phone makes a random ID
(kept next to its progress) and reports a small picture: the day the member tapped Start, which core lessons are
finished and which Go deeper sections are finished. The server keeps one record per ID and the latest picture replaces
the last, so a repeated or lost message never double-counts. It stores no name, phone number or address. The home page
tells members that they are counted and that no names are kept.

**What is counted.**

| Number | Meaning |
| --- | --- |
| Tapped Start | A phone that tapped "Start the challenge" (or picked "Started earlier"). |
| Active in the last 3 days | Of those, a phone the server heard from in the last 3 days. Phones report when something changes and at least once every 6 hours while the app is open. |
| Finished the lesson / went deeper (per day) | The core lesson reached its last card; the Go deeper section reached its last card. |
| Finished all 14 days | The core lesson of every day. |
| Where people are | The last core day each person finished, to show where people stop. |

**One-time setup (about two minutes).** The counter uses Netlify Functions and Netlify Blobs, both built into Netlify, so
there is nothing to install or pay for. The only thing to set is a secret key that protects the numbers:

1. Make a key of at least 16 characters. In a terminal, `openssl rand -hex 16` prints a good one. Keep it private.
2. In Netlify: **Site configuration, Environment variables, Add a variable**. Key `STATS_KEY`, value your key. Save.
3. **Deploys, Trigger deploy, Deploy site** (a new deploy picks up the variable).
4. Open `https://YOUR-SITE/stats.html#key=YOUR_KEY` and bookmark it. The part after `#` is never sent to the server in
   the page request. Without the `#key=` part the page asks for the key.

Until `STATS_KEY` is set, `/api/stats` answers "not set up" and nobody can read anything. The page never opens without the key.

**What it cannot tell you.**
- Counts are per phone or browser. Someone who clears their data, switches phones or uses two browsers is counted twice.
- A browser that cannot save data (some in-app browsers) cannot keep an ID, so it is not counted at all.
- It starts counting when this goes live. Nothing earlier is known.
- It does not know who posted in the WhatsApp group or who joined the Sunday KO.
- Test links (`?preview=1`, `?now=...`) and the local dev server are never counted, so reviewing does not change the numbers.
- Players who tapped Start and then reset their progress go back to "not started" in the counts.

**Trying it locally.** The Vite dev server does not run Netlify functions (and does not count anyway). To see the whole thing
working, use `npx netlify-cli dev` from this folder with a `STATS_KEY` in the environment, or run the unit tests
(`tests/stats.test.ts`, `tests/tracker.test.ts`), which cover the same code with an in-memory store.

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
| Board and pieces | Own board code; piece artwork supplied by Castle Connect, traced to SVG (`src/ui/pieces.ts`) | No GPL board library. The piece set is the one Castle Connect supplied; confirm you hold the rights to it. |
| Routing | `#/day/3` style hash links | Works on any static host and inside WhatsApp's browser, no server rules. |
| Moving pieces | Drag a piece, or tap it and tap where it goes | Both work on every device (one code path: pointer events). A press that barely moves is a tap; one that travels is a drag, with a ghost piece that rides above a finger so it is not hidden. Only squares holding a piece stop page scrolling, and only on boards where dragging is on. Escape cancels a drag. |
| Share picture | A 1080x1350 PNG drawn on the member's phone with a canvas (`src/lib/shareCard.ts`), sent through the phone's share menu | Carries the Castle Connect logo (embedded, so it works offline) and every detail of the day. WhatsApp cannot attach a picture from a link, so the share menu is the way; computers get a saved file instead. Nothing is uploaded anywhere. |
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
  lib/              time, store, share, shareCard (draws the WhatsApp picture), stats + tracker (the player counter), chess helpers (mostly no DOM, easy to test)
  ui/               board, cards, move/spot tasks, home, lesson, review screens
  styles.css        design tokens and styles (light + dark)
public/             icons, manifest, _headers, stats.html (the private stats page)
netlify/functions/  the two counter functions: /api/track and /api/stats
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

**The "Powered by Netlify" badge.** Free-plan Netlify projects can show a badge in the bottom-right
corner of every page. To remove it: **Project configuration, General, Powered by Netlify badge**, switch
it off and save (no redeploy needed). If it stays on, the app notices Netlify's badge script
(`src/lib/hostBadge.ts`): on tablets and computers the buttons stay at the bottom and Next stops short of the
badge. On phones the buttons stay on the bottom edge and the badge can cover part of Next, so switching
the badge off is the way to avoid that.

**Never publish the parent folder.** This project lives in `bridge-grind/`. The folder around it holds
the source book PDF and working files that must not go on the internet.

## WhatsApp link preview

When someone pastes the link into a chat, WhatsApp shows a card: the picture in
`public/og-image.png`, a title and one line of text (both set in `scripts/social.ts`).

- **On Netlify there is nothing to set.** WhatsApp needs the picture's full `https://` address, and the
  build takes it from Netlify's own `URL` setting. A custom domain added later is picked up on the next deploy.
- **Building by hand** (the drag-and-drop route): give it the address, for example
  `SITE_URL=https://your-site.netlify.app npm run build`. Without one the card still has the title
  and text but no picture, and the build says so.
- **Check it after a deploy:** `curl -s https://your-site.netlify.app | grep og:` should list
  `og:image` with a full `https://` address, and that address should open the picture in a browser.
- **WhatsApp remembers cards.** A link already pasted somewhere before this deploy may keep its old
  card for a while. Adding anything to the end of the link, such as `?v=2`, makes WhatsApp fetch a
  fresh one. Brand-new links are not affected.
- The card is the same for every page, because the part after `#` (like `#/day/3`) never reaches the server.
- To change the picture: replace `public/og-image.png` (1200 by 630, under 300 KB is safest).

## Before launch: test on real phones

These could not be tested in this build environment and need a real Android phone, opening the
link **from inside WhatsApp**:

- [ ] Paste the link into a WhatsApp chat: the card shows the picture, title and text.
- [ ] The page loads and is styled; the board shows pieces.
- [ ] Progress survives closing WhatsApp and tapping the link again (some in-app browsers block storage; the page shows a warning if so).
- [ ] "Share the picture" opens the phone's share menu with the progress picture (logo, day, score, days done, the member's line); choose the WhatsApp group and check the picture arrives with the message as its caption. On a computer it saves the picture and copies the message instead. "Share the text only" and the WhatsApp button still work.
- [ ] The picture shows the real site address in its footer (not on localhost), and a long line of 240 characters still fits.
- [ ] Tapping and moving pieces feels right with a thumb, on the smallest phone you have. Try dragging too, and check that scrolling the page by swiping on empty squares still works.
- [ ] On a laptop and a tablet: the layout fills the screen sensibly and dragging and clicking pieces with a mouse both work.
- [ ] The sun/moon button switches modes, and the choice is still there after closing WhatsApp and reopening the link.
- [ ] "Add to home screen" and offline reopening (Chrome only; WhatsApp's browser may not offer it).
- [ ] Tap "Start the challenge": Day 1 opens, and Day 2 shows "Opens" with tomorrow's date. Close WhatsApp and reopen the link: the start is remembered.
- [ ] Open the link in a second browser (or after clearing data): the Start button comes back, and "Started earlier? Tell us which day" sets the day.

## Licences

Code: yours to choose; there is no third-party code beyond chess.js (BSD-2) and the dev tools
(Vite, Vitest, TypeScript, tsx; all MIT or Apache-2.0). Piece artwork: original. Logo and
colours: Castle Connect's own. The lessons are written in original words with original
positions; the source book is a reference only and nothing is copied from it.

**Puzzle data:** Days 1 to 3 use hand-built, machine-verified puzzles, not the Lichess
database. If we add Lichess puzzles later, confirm the licence at database.lichess.org first.
