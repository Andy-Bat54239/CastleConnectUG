# Writing a lesson

Each day is one file: `day-01.json` ... `day-14.json`. The 14 titles and levels live in
`index.json`; a day file must repeat its title, level and "go deeper" title exactly (the validator
checks, so the home screen and the lesson never disagree).

A day has two parts:

- **core**: about 15 minutes, everyone does it. Finishing it counts the day as done.
- **deeper**: about 15 optional minutes for people who want more.

Aim for **at least 60% interactive cards** and keep read cards short (the validator warns past
about 90 words). Boring is an interaction problem, not a length problem.

## Check your work

```bash
npm run validate                     # checks every day file
npm run dev                          # then open  /?preview=1#/day/4   to play it
                                     #            /?preview=1#/review/4 to read it
npm run probe -- "<fen>"             # facts about a position (mates, loose pieces, safe moves)
npm run probe -- "<fen>" d4          # ...and what the piece on d4 attacks / is attacked by
npm run probe -- "<fen>" --mate 2     # every first move that FORCES checkmate within 2 moves (try 1 to 3)
npm run line  -- "e4 e5 Nf3 Nc6"     # plays moves and prints the FEN after each
```

`probe` and `line` are how you build positions without typos: set a position up by playing moves,
copy the FEN, then ask `probe` what is true about it before you write a sentence that depends on it.

## File shape

```json
{
  "day": 6,
  "title": "The checklist",
  "level": "600-1000",
  "blurb": "One friendly line shown on the home screen.",
  "deeperTitle": "Discovered attacks and checks; danger levels",
  "share": { "prompt": "One thing I learned today…" },
  "core":   [ ...cards... ],
  "deeper": [ ...cards... ]
}
```

In any text, `**double asterisks**` make bold. Nothing else is formatting; HTML is not allowed.

A FEN is a position written as text, for example `6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1`
(`w` or `b` after the board says who is to move). Moves are written in standard notation:
`Nf3`, `Qxf7#`, `O-O`. Write `+` for check and `#` for checkmate; the validator rejects a `#`
that is not really mate.

## Card types

### `read`: a short card, optional board

```json
{ "type": "read", "title": "Castle early",
  "body": ["First paragraph.", "Second paragraph."],
  "board": { "fen": "...", "arrows": [["e1","g1"]], "highlight": ["f1","g1"], "caption": "Optional." } }
```

### `choice`: multiple choice, optional board

```json
{ "type": "choice", "prompt": "Which move fights for the centre?",
  "board": { "fen": "..." },
  "options": ["Pawn to e4", "Pawn to a4", "Knight to h3"],
  "answer": 0, "explain": "Shown after they answer." }
```
`answer` counts from 0. Use 2 to 4 options.

### `findMove`: the member plays the move on the board

How the answer is judged is set by `goal`:

| `goal` | Accepts | Fields |
| --- | --- | --- |
| `"san"` (default) | the stored move(s) | `solution`, optional `accept` |
| `"mate"` | **any** move that gives checkmate | none (the validator confirms a mate exists) |
| `"avoidMate"` | any move after which the opponent has no mate in one | none |
| `"answer"` | any move that answers an attack the stated way | `verify: { "method", "target" }` |

```json
{ "type": "findMove", "prompt": "Checkmate in one.", "fen": "...", "goal": "mate",
  "hint": "Optional. Appears after a first miss.", "explain": "Shown when solved." }

{ "type": "findMove", "prompt": "Develop a knight or bishop.", "fen": "...",
  "solution": ["Nf3"], "accept": ["Nc3", "Bc4"], "explain": "..." }

{ "type": "findMove", "prompt": "Play the first three moves of the Italian.",
  "fen": "<start>", "solution": ["e4", "e5", "Nf3", "Nc6", "Bc4"], "explain": "..." }
```
In a `solution` the moves alternate: yours, the opponent's reply (played automatically), yours...
so it has an odd number of moves. `accept` is only for single-move solutions.

For `"answer"`, `method` is `move`, `capture`, `block`, `defend` or `any`, and `target` is the
square of the attacked piece. The validator proves that piece really is in danger, lists every
move that counts, and the card gives a friendly nudge if someone solves it a different way
("That keeps it safe, but by moving it. This time, capture the attacker.").

Members get a hint after one miss and a **Show me** button after two, so nobody gets stuck.

### `spot`: tap a square or piece

```json
{ "type": "spot", "prompt": "Tap the piece giving check.",
  "board": { "fen": "..." }, "targets": ["h5"], "explain": "...",
  "verify": { "kind": "checkers" } }
```
`verify` is optional but strongly recommended. It makes the validator prove the claim:
`checkers` (targets are exactly the pieces giving check), `attackedBy` + `square` (the enemy
pieces that piece attacks), `loose` + `color` (the pieces with no defender), `legalMoves` + `square`
(the squares the piece on that square can legally move to, for example a king's escape squares).

### `puzzleSet`: 2 to 6 short puzzles

```json
{ "type": "puzzleSet", "title": "Forks", "theme": "fork", "ratingMin": 600, "ratingMax": 1000,
  "intro": "Optional.",
  "puzzles": [ { "fen": "...", "solution": ["Nxf7+"], "hint": "...", "explain": "..." } ] }
```
The solver is whoever is to move in the FEN. If a puzzle's answer is checkmate, **any** mating
move is accepted. (When Lichess puzzles are added later, `rating` and `lichessId` fields are
already allowed on a puzzle.)

## Making board claims verifiable

Any `board` can carry an `assert`. The validator then checks the lesson's words against the
position, so a sentence like "this knight attacks eight squares" cannot be wrong:

```json
"board": { "fen": "...", "highlight": ["c3","c5","d2","d6","f2","f6","g3","g5"],
           "assert": { "attackCount": {"e4": 8}, "highlightIsAttacksOf": "e4" } }
```
Available: `status` (`checkmate`, `stalemate`, `check`, `normal`, `insufficient`), `attackCount`,
`highlightIsAttacksOf`, `undefended`, `defended`, `attacked`.

## Mates are proven, not just played

When a stored line ends in `#` (a `solution` or a puzzle), the validator does not only check that the
moves are legal. It searches **every** defence and fails the build if the opponent has any reply that
escapes the mate. So "Mate in two" in a lesson really is forced. It does this for mates in up to 3
moves. Use `npm run probe -- "<fen>" --mate 2` while writing to see which first moves truly work.

## Rules the validator enforces

Positions must be legal (and the side that just moved cannot be in check). Every stored move must
be legal and written exactly as standard notation would write it. A `#` must be a real mate.
Mate and `avoidMate` goals must actually have an answer. Unknown field names are errors, so a
typo like `solutoin` cannot silently do nothing.

## Changing a lesson once the challenge is running

Fixing typos and wording is always safe. Progress is saved by card **position** (card 4 of Core),
so **do not insert, remove or reorder cards in a day that members have already started**: their
saved answers would line up with the wrong cards. Add new cards at the end instead.
