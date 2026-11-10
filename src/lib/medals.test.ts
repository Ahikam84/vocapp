import { describe, expect, it } from 'vitest'
import { evaluateMedals, type MedalData } from './medals'

const DAY = 86_400_000
const noon = (daysAgo: number, hour = 12) => {
  const d = new Date(2026, 10, 20, hour)
  return d.getTime() - daysAgo * DAY
}
const card = (stability: number) => ({ stability }) as MedalData['progress'][number]['card']

function base(over: Partial<MedalData> = {}): MedalData {
  return { reviews: [], progress: [], words: [], decks: [], goalType: 'answers', goal: 10, now: noon(0), ...over }
}
const earned = (d: MedalData) => new Set(evaluateMedals(d).filter((m) => m.earned).map((m) => m.id))

describe('medals', () => {
  it('starts with nothing earned', () => {
    const medals = evaluateMedals(base())
    expect(medals.length).toBeGreaterThan(20)
    expect(medals.every((m) => !m.earned)).toBe(true)
  })

  it('counts learned and long-term words, leaving out words marked known', () => {
    const progress = Array.from({ length: 12 }, (_, i) => ({ wordId: `w${i}`, deckId: 'd', learnedAt: noon(1), card: card(i < 10 ? 30 : 1) }))
    const words = [{ id: 'w0', deckId: 'd', known: true }]
    const got = earned(base({ progress, words }))
    expect(got.has('learned-10')).toBe(true) // 11 learned, one is "known"
    expect(got.has('learned-50')).toBe(false)
    expect(got.has('longterm-10')).toBe(false) // 9 long-term after leaving out the known one
    const medal = evaluateMedals(base({ progress, words })).find((m) => m.id === 'longterm-10')!
    expect([medal.value, medal.target]).toEqual([9, 10])
  })

  it('awards streak and goal-day medals from days the goal was met', () => {
    // 10 answers on each of the last 3 days (goal: 10 answers)
    const reviews = [0, 1, 2].flatMap((day) => Array.from({ length: 10 }, () => ({ correct: true, responseMs: 3000, at: noon(day) })))
    const got = earned(base({ reviews }))
    expect(got.has('streak-3')).toBe(true)
    expect(got.has('streak-7')).toBe(false)
    expect(got.has('goal-1')).toBe(true)
  })

  it('gives the special medals', () => {
    const reviews = [
      ...Array.from({ length: 20 }, () => ({ correct: true, responseMs: 2000, at: noon(3) })),
      { correct: true, responseMs: 2000, at: noon(2, 23) },
      { correct: false, responseMs: 2000, at: noon(2, 6) },
    ]
    const words = Array.from({ length: 20 }, (_, i) => ({ id: `w${i}`, deckId: 'es', known: false }))
    const progress = [
      ...words.map((w) => ({ wordId: w.id, deckId: 'es', learnedAt: noon(4), card: card(3) })),
      { wordId: 'h1', deckId: 'he', learnedAt: noon(4), card: card(3) },
    ]
    const decks = [{ id: 'es', targetLang: 'es' }, { id: 'he', targetLang: 'he' }]
    const got = earned(base({ reviews, words, progress, decks }))
    for (const id of ['perfect-day', 'night-owl', 'early-bird', 'course-done', 'polyglot']) expect(got.has(id), id).toBe(true)
  })
})
