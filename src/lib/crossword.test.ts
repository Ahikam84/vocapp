import { describe, expect, it } from 'vitest'
import { cellsOf, crosswordAnswer, generateCrossword, type Crossword } from './crossword'

const WORDS = ['perro', 'gato', 'casa', 'mesa', 'rojo', 'verde', 'agua', 'libro', 'tarde', 'noche', 'ventana', 'puerta']

/** Seeded random numbers, so a failing grid can be reproduced. */
function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
}

/** Every rule a crossword grid must keep. */
function check(cw: Crossword<string>, maxSize: number) {
  const letters = new Map<string, string>()
  for (const w of cw.words)
    cellsOf(w).forEach(([r, c], i) => {
      const k = `${r},${c}`
      expect(letters.get(k) ?? w.answer[i], `letter clash at ${k}`).toBe(w.answer[i])
      letters.set(k, w.answer[i])
    })
  expect(cw.width).toBeLessThanOrEqual(maxSize)
  expect(cw.height).toBeLessThanOrEqual(maxSize)
  // Two neighbouring letters always belong to one word running that way (no accidental words).
  for (const k of letters.keys()) {
    const [r, c] = k.split(',').map(Number)
    for (const [dr, dc, across] of [[0, 1, true], [1, 0, false]] as const) {
      if (!letters.has(`${r + dr},${c + dc}`)) continue
      const shared = cw.words.some((w) => w.across === across && cellsOf(w).some(([a, b]) => a === r && b === c) && cellsOf(w).some(([a, b]) => a === r + dr && b === c + dc))
      expect(shared, `stray neighbours at ${k}`).toBe(true)
    }
  }
  // All words connected
  const seen = new Set([0])
  for (let grew = true; grew; ) {
    grew = false
    cw.words.forEach((w, i) => {
      if (seen.has(i)) return
      const mine = new Set(cellsOf(w).map(([r, c]) => `${r},${c}`))
      if ([...seen].some((j) => cellsOf(cw.words[j]).some(([r, c]) => mine.has(`${r},${c}`)))) { seen.add(i); grew = true }
    })
  }
  expect(seen.size).toBe(cw.words.length)
}

describe('crossword', () => {
  it('builds valid, connected grids that fit the screen', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const items = WORDS.map((w) => ({ ref: w, answer: crosswordAnswer(w)! }))
      const cw = generateCrossword(items, { random: seeded(seed), maxSize: 11, maxWords: 10 })!
      expect(cw.words.length).toBeGreaterThanOrEqual(6)
      check(cw, 11)
    }
  })

  it('numbers clues from the first row, in reading order', () => {
    const items = WORDS.map((w) => ({ ref: w, answer: crosswordAnswer(w)! }))
    const cw = generateCrossword(items, { random: seeded(7) })!
    const first = cw.words.find((w) => w.number === 1)!
    expect(first.row).toBe(Math.min(...cw.words.map((w) => w.row)))
    expect(cw.words.every((w, i) => i === 0 || w.number >= cw.words[i - 1].number)).toBe(true)
  })

  it('keeps answers to single words, in plain letters', () => {
    expect(crosswordAnswer('canción')).toEqual([...'cancion'])
    expect(crosswordAnswer('مَدْرَسَة')).toEqual([...'مدرسه'])
    expect(crosswordAnswer('buenos días')).toBeNull()
    expect(crosswordAnswer('a')).toBeNull()
  })
})
