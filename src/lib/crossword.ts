import { baseLetters } from './games'

/**
 * A small crossword built from the learner's own words, a new one every game. Answers are kept as
 * base letters (no accents, vowel marks or final forms), so crossings match the way the learner types.
 */

export interface CrosswordItem<T = unknown> {
  /** What the answer is for (the word); passed through untouched */
  ref: T
  /** The answer, one letter per cell */
  answer: string[]
}

export interface Placed<T = unknown> extends CrosswordItem<T> {
  row: number
  /** Counted in reading order: from the right in Arabic and Hebrew, from the left otherwise */
  col: number
  across: boolean
  /** The clue number in the grid */
  number: number
}

export interface Crossword<T = unknown> {
  width: number
  height: number
  words: Placed<T>[]
}

/** The letters of an answer as they go in the cells; null when it doesn't fit a crossword. */
export function crosswordAnswer(text: string, maxLength = 10): string[] | null {
  const trimmed = text.trim()
  // One word only: phrases would need gaps in the grid.
  if (!trimmed || /\s/.test(trimmed)) return null
  const letters = [...baseLetters(trimmed)].filter((c) => /\p{L}/u.test(c))
  return letters.length >= 2 && letters.length <= maxLength ? letters : null
}

const key = (r: number, c: number) => `${r},${c}`

interface Cell { letter: string; across: boolean; down: boolean }

/** Builds the grid word by word, each new word crossing one already placed; keeps the best of several tries. */
export function generateCrossword<T>(
  items: CrosswordItem<T>[],
  { maxWords = 10, maxSize = 11, attempts = 40, random = Math.random }: { maxWords?: number; maxSize?: number; attempts?: number; random?: () => number } = {},
): Crossword<T> | null {
  let best: { words: Omit<Placed<T>, 'number'>[]; area: number; crossings: number } | null = null
  for (let a = 0; a < attempts; a++) {
    const result = attempt(items, maxWords, maxSize, random)
    if (!result) continue
    const better = !best
      || result.words.length > best.words.length
      || (result.words.length === best.words.length && (result.crossings > best.crossings || (result.crossings === best.crossings && result.area < best.area)))
    if (better) best = result
  }
  return best && best.words.length >= 2 ? finish(best.words) : null
}

function attempt<T>(items: CrosswordItem<T>[], maxWords: number, maxSize: number, random: () => number) {
  // Long words first make a good backbone; a little shuffling gives a different grid each time.
  const order = [...items]
    .map((item) => ({ item, sort: item.answer.length + random() * 3 }))
    .sort((x, y) => y.sort - x.sort)
    .map((x) => x.item)
  const grid = new Map<string, Cell>()
  const words: Omit<Placed<T>, 'number'>[] = []
  let crossings = 0
  let box = { top: 0, bottom: 0, left: 0, right: 0 }

  const place = (item: CrosswordItem<T>, row: number, col: number, across: boolean) => {
    item.answer.forEach((letter, i) => {
      const r = across ? row : row + i
      const c = across ? col + i : col
      const cell = grid.get(key(r, c)) ?? { letter, across: false, down: false }
      if (across) cell.across = true
      else cell.down = true
      grid.set(key(r, c), cell)
    })
    words.push({ ...item, row, col, across })
    const endR = across ? row : row + item.answer.length - 1
    const endC = across ? col + item.answer.length - 1 : col
    box = words.length === 1
      ? { top: row, bottom: endR, left: col, right: endC }
      : { top: Math.min(box.top, row), bottom: Math.max(box.bottom, endR), left: Math.min(box.left, col), right: Math.max(box.right, endC) }
  }

  /** How many letters the word would share with the grid there, or -1 when it can't go there. */
  const fit = (answer: string[], row: number, col: number, across: boolean): number => {
    const dr = across ? 0 : 1
    const dc = across ? 1 : 0
    // Nothing right before or after the word
    if (grid.has(key(row - dr, col - dc)) || grid.has(key(row + dr * answer.length, col + dc * answer.length))) return -1
    let shared = 0
    for (let i = 0; i < answer.length; i++) {
      const r = row + dr * i
      const c = col + dc * i
      const cell = grid.get(key(r, c))
      if (cell) {
        if (cell.letter !== answer[i] || (across ? cell.across : cell.down)) return -1
        shared++
      } else if (grid.has(key(r + dc, c + dr)) || grid.has(key(r - dc, c - dr))) {
        return -1 // would sit right alongside another word
      }
    }
    const top = Math.min(box.top, row), left = Math.min(box.left, col)
    const bottom = Math.max(box.bottom, row + dr * (answer.length - 1)), right = Math.max(box.right, col + dc * (answer.length - 1))
    if (bottom - top + 1 > maxSize || right - left + 1 > maxSize) return -1
    return shared
  }

  for (const item of order) {
    if (words.length >= maxWords) break
    if (!words.length) {
      if (item.answer.length > maxSize) continue
      place(item, 0, 0, random() < 0.5)
      continue
    }
    if (words.some((w) => w.answer.join('') === item.answer.join(''))) continue
    // Every spot where one of its letters meets the same letter in the grid
    let spot: { row: number; col: number; across: boolean; shared: number; area: number } | null = null
    for (const [k, cell] of grid) {
      const [r, c] = k.split(',').map(Number)
      item.answer.forEach((letter, i) => {
        if (letter !== cell.letter) return
        for (const across of [true, false]) {
          if (across ? cell.across : cell.down) continue
          const row = across ? r : r - i
          const col = across ? c - i : c
          const shared = fit(item.answer, row, col, across)
          if (shared < 1) continue
          const w = Math.max(box.right, across ? col + item.answer.length - 1 : col) - Math.min(box.left, col) + 1
          const h = Math.max(box.bottom, across ? row : row + item.answer.length - 1) - Math.min(box.top, row) + 1
          const area = w * h + random()
          if (!spot || shared > spot.shared || (shared === spot.shared && area < spot.area)) spot = { row, col, across, shared, area }
        }
      })
    }
    if (spot) {
      const s = spot as { row: number; col: number; across: boolean; shared: number }
      place(item, s.row, s.col, s.across)
      crossings += s.shared
    }
  }
  if (!words.length) return null
  return { words, crossings, area: (box.bottom - box.top + 1) * (box.right - box.left + 1) }
}

/** Moves the grid to start at 0,0 and numbers the clues in reading order. */
function finish<T>(words: Omit<Placed<T>, 'number'>[]): Crossword<T> {
  const top = Math.min(...words.map((w) => w.row))
  const left = Math.min(...words.map((w) => w.col))
  const moved = words.map((w) => ({ ...w, row: w.row - top, col: w.col - left }))
  const width = Math.max(...moved.map((w) => w.col + (w.across ? w.answer.length : 1)))
  const height = Math.max(...moved.map((w) => w.row + (w.across ? 1 : w.answer.length)))
  const starts = [...new Set(moved.map((w) => key(w.row, w.col)))]
    .map((k) => k.split(',').map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const numberOf = new Map(starts.map(([r, c], i) => [key(r, c), i + 1]))
  const numbered = moved
    .map((w) => ({ ...w, number: numberOf.get(key(w.row, w.col))! }))
    .sort((a, b) => a.number - b.number || Number(b.across) - Number(a.across))
  return { width, height, words: numbered }
}

/** The cells a word covers, in order. */
export function cellsOf(w: Pick<Placed, 'row' | 'col' | 'across' | 'answer'>): [number, number][] {
  return w.answer.map((_, i) => (w.across ? [w.row, w.col + i] : [w.row + i, w.col]))
}
