/** Content schema for Bridge Grind. Day files in /content must match these shapes (checked by `npm run validate`). */

/** A square in algebraic notation, e.g. "e4". */
export type Square = string

/** Checks the validator runs on a board so that what a lesson says about a position is true. */
export interface BoardAssert {
  /** The position must be exactly this: checkmate, stalemate, check (not mate), normal, or insufficient (dead draw). */
  status?: 'checkmate' | 'stalemate' | 'check' | 'normal' | 'insufficient'
  /** Number of squares the piece on each key square attacks. */
  attackCount?: Record<Square, number>
  /** The `highlight` squares must be exactly the squares attacked by the piece on this square. */
  highlightIsAttacksOf?: Square
  /** Pieces on these squares must have no friendly defender. */
  undefended?: Square[]
  /** Pieces on these squares must have at least one friendly defender. */
  defended?: Square[]
  /** Pieces on these squares must be attacked by the opponent. */
  attacked?: Square[]
}

export interface BoardSpec {
  fen: string
  caption?: string
  /** Squares to tint (for example the squares a piece can reach). */
  highlight?: Square[]
  /** Arrows as [from, to]. */
  arrows?: [Square, Square][]
  /** Show Black at the bottom. Default: White at the bottom. */
  flip?: boolean
  assert?: BoardAssert
}

export interface ReadCard {
  type: 'read'
  title: string
  /** One paragraph, or several. `**bold**` is the only formatting. */
  body: string | string[]
  board?: BoardSpec
}

export interface ChoiceCard {
  type: 'choice'
  prompt: string
  board?: BoardSpec
  options: string[]
  /** Index into `options` (first option is 0). */
  answer: number
  explain: string
}

/** Names the kind of answer a find-the-move card is looking for, when the goal is "answer". */
export interface MoveVerify {
  /**
   * How the move must deal with the attack on `target`: move the piece, capture the attacker,
   * block the line, or defend it. "any" accepts all four.
   */
  method?: 'move' | 'capture' | 'block' | 'defend' | 'any'
  /** Square of the attacked piece. */
  target?: Square
}

export interface FindMoveCard {
  type: 'findMove'
  prompt: string
  fen: string
  /**
   * How an answer is judged.
   * - "san" (default): the move must be `solution[0]` or one of `accept`.
   * - "mate": any move that gives checkmate.
   * - "avoidMate": any move after which the opponent has no mate in one.
   * - "answer": any move that deals with the attack on `verify.target` in the way `verify.method` names.
   */
  goal?: 'san' | 'mate' | 'avoidMate' | 'answer'
  /** Moves in SAN, alternating: yours, the opponent's reply (played automatically), yours... */
  solution?: string[]
  /** Other first moves that are just as good (SAN). */
  accept?: string[]
  hint?: string
  explain: string
  highlight?: Square[]
  arrows?: [Square, Square][]
  verify?: MoveVerify
}

export interface SpotVerify {
  /** Targets must be exactly: the pieces giving check / the enemy pieces the piece on `square` attacks / the undefended pieces of `color`. */
  kind: 'checkers' | 'attackedBy' | 'loose'
  square?: Square
  color?: 'w' | 'b'
}

export interface SpotCard {
  type: 'spot'
  prompt: string
  board: BoardSpec
  /** Any of these squares counts as correct. */
  targets: Square[]
  explain: string
  verify?: SpotVerify
}

export interface Puzzle {
  /** Position with the solver to move. */
  fen: string
  /** SAN moves alternating: solver, opponent reply, solver... A final "#" must really be mate. */
  solution: string[]
  /** Lichess rating if the puzzle came from the Lichess database. */
  rating?: number
  lichessId?: string
  hint?: string
  /** Shown after the puzzle is solved. */
  explain?: string
}

export interface PuzzleSetCard {
  type: 'puzzleSet'
  title: string
  theme: string
  ratingMin?: number
  ratingMax?: number
  intro?: string
  puzzles: Puzzle[]
}

export type Card = ReadCard | ChoiceCard | FindMoveCard | SpotCard | PuzzleSetCard

export interface DayContent {
  day: number
  title: string
  /** Rough Elo band this day is pitched at, e.g. "0-600". */
  level: string
  /** One friendly line shown on the home screen. */
  blurb: string
  /** Title of the optional Go deeper part. */
  deeperTitle: string
  core: Card[]
  deeper: Card[]
  share: { prompt: string }
}

export interface CourseIndexEntry {
  day: number
  title: string
  deeperTitle: string
  level: string
}

export interface CourseConfig {
  /** Midnight (Kampala time) at the start of Day 1, as an ISO string with +03:00. */
  startDate: string
  /** Name shown in the share message. */
  challengeName: string
  /** Where the "join the Sunday KO" style links would go. Optional. */
  groupNote?: string
  /**
   * When true, every day is open regardless of the date (for trying things out, or before the real
   * start). Set it to false, or remove it, for the real challenge so days unlock one per day.
   */
  unlockAll?: boolean
}
