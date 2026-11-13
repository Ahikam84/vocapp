import { describe, expect, it } from 'vitest'
import type { Word } from './db'
import { answerXp, XP } from './goals'
import { evaluateMedals } from './medals'
import { buildTest, questionScore, testHistory, testPercent, TYPED } from './test'

const w = (term: string, tr: string, example?: string): Word => ({ id: term, deckId: 'd', term, translations: [tr], example, createdAt: 0 })
const POOL = [
  w('perro', 'כלב', 'Mi perro es grande.'), w('gato', 'חתול'), w('casa', 'בית', 'La casa es azul.'), w('mesa', 'שולחן'),
  w('libro', 'ספר'), w('agua', 'מים'), w('sol', 'שמש'), w('luna', 'ירח'), w('mar', 'ים'), w('pan', 'לחם'),
  w('leche', 'חלב'), w('silla', 'כיסא'),
]

describe('tests', () => {
  it('asks one question per word, as many as asked for', () => {
    expect(buildTest(POOL, POOL, 'medium', 10, true)).toHaveLength(10)
    expect(buildTest(POOL.slice(0, 4), POOL, 'medium', 10, true)).toHaveLength(4)
    const words = buildTest(POOL, POOL, 'easy', 10, true).map((q) => q.word.id)
    expect(new Set(words).size).toBe(10)
  })

  it('leans on recognition when easy and on typing when hard', () => {
    const typed = (level: 'easy' | 'hard') => buildTest(POOL, POOL, level, 10, true).filter((q) => TYPED.includes(q.kind)).length
    expect(typed('easy')).toBe(0)
    expect(typed('hard')).toBe(10)
  })

  it('replaces questions that cannot be asked: no sentence, no voice', () => {
    for (let i = 0; i < 10; i++) {
      for (const q of buildTest(POOL, POOL, 'hard', 12, false)) {
        expect(q.kind).not.toBe('dictation')
        if (q.kind === 'cloze-type') expect(q.cloze).toBeTruthy()
      }
      for (const q of buildTest(POOL, POOL, 'easy', 12, false)) {
        expect(q.kind).not.toBe('listen')
        if (q.kind === 'match') expect(q.pairs).toHaveLength(4)
        if (q.kind === 'choice-meaning' || q.kind === 'choice-term') expect(q.options).toHaveLength(4)
      }
    }
  })

  it('scores right as 1, almost as ½ and matching by the pairs found first time', () => {
    expect(questionScore([{ correct: true }])).toBe(1)
    expect(questionScore([{ correct: true, almost: true }])).toBe(0.5)
    expect(questionScore([{ correct: true }, { correct: true }, { correct: false }, { correct: true }])).toBe(0.75)
    expect(testPercent([1, 0.5, 0, 1])).toBe(63)
  })

  it('rebuilds finished tests from their answers, skipping ones left halfway', () => {
    const ref = (id: string, q: number, questions = 2) => ({ id, level: 'easy' as const, questions, q })
    const reviews = [
      { correct: true, at: 1, test: ref('a', 0) },
      { correct: false, at: 2, test: ref('a', 1) },
      { correct: true, at: 3, test: ref('b', 0) }, // never finished
      { correct: true, at: 4 },
    ]
    expect(testHistory(reviews)).toEqual([{ id: 'a', at: 2, level: 'easy', questions: 2, percent: 50 }])
  })

  it('gives XP for test answers and medals for tests', () => {
    expect(answerXp({ correct: true, mode: 'test' })).toBe(XP.test)
    expect(answerXp({ correct: false, mode: 'test' })).toBe(0)
    const reviews = Array.from({ length: 10 }, (_, q) => ({ correct: true, responseMs: 1000, at: 1000 + q, test: { id: 't', level: 'hard' as const, questions: 10, q } }))
    const medals = evaluateMedals({ reviews, progress: [], words: [], decks: [], goalType: 'xp', goal: 50, now: 2000 })
    expect(medals.find((m) => m.id === 'tests-1')?.earned).toBe(true)
    expect(medals.find((m) => m.id === 'ace')?.earned).toBe(true)
  })
})

describe("can't listen", () => {
  it('turns listening questions into silent ones and leaves the rest', async () => {
    const { withoutAudio } = await import('./test')
    const word = { id: 'w', deckId: 'd', term: 'perro', translations: ['כלב'], createdAt: 0 }
    expect(withoutAudio({ kind: 'listen', word, options: [word] })).toMatchObject({ kind: 'choice-meaning', options: [word] })
    expect(withoutAudio({ kind: 'dictation', word }).kind).toBe('type-term')
    expect(withoutAudio({ kind: 'cloze', word }).kind).toBe('cloze')
  })
})
