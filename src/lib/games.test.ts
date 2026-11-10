import { describe, expect, it } from 'vitest'
import { COURSES } from '../courses'
import { pace } from '../games/Falling'
import { courseToWords } from './courses'
import type { Word } from './db'
import { alphabetFor, baseLetters, clozeFor, genderOf, isRecord, listenOptions, oddQuestion, topicGroups, trueFalseFor } from './games'
import { answerXp, XP } from './goals'

const word = (term: string, example?: string): Word => ({ id: term, deckId: 'd', term, translations: ['x'], example, createdAt: 0 })

describe('games', () => {
  it('gives a few XP per right game answer and none for a miss', () => {
    expect(answerXp({ correct: true, mode: 'game' })).toBe(XP.game)
    expect(answerXp({ correct: false, mode: 'game' })).toBe(0)
    expect(answerXp({ correct: true, mode: 'review' })).toBe(XP.correct)
  })

  it('speeds up falling words as the score rises, within limits', () => {
    const start = pace(0)
    const later = pace(20)
    expect(later.gapMs).toBeLessThan(start.gapMs)
    expect(later.fallSec).toBeLessThan(start.fallSec)
    expect(pace(0)).toEqual({ gapMs: 4500, fallSec: 16 })
    expect(pace(1000)).toEqual({ gapMs: 1300, fallSec: 5 })
  })

  it('cuts the word out of its example sentence', () => {
    expect(clozeFor(word('aunque', 'Aunque estoy cansado, voy a salir.'))).toMatchObject({ before: '', answer: 'Aunque', after: ' estoy cansado, voy a salir.' })
    // without its article, when that's how the sentence has it
    expect(clozeFor(word('el perro', 'Mi perro come mucho.'))).toMatchObject({ before: 'Mi ', answer: 'perro', bare: true })
    // whole words only, and nothing when the word isn't there as written
    expect(clozeFor(word('sol', 'Soltero y feliz.'))).toBeNull()
    expect(clozeFor(word('comer', 'Ayer comí pasta.'))).toBeNull()
  })

  it('finds el/la nouns', () => {
    expect(genderOf(word('el agua'))).toEqual({ article: 'el', noun: 'agua' })
    expect(genderOf(word('la mano'))).toEqual({ article: 'la', noun: 'mano' })
    expect(genderOf(word('los zapatos'))).toBeNull()
    expect(genderOf(word('comer'))).toBeNull()
  })

  it('guesses letters on the base letter', () => {
    expect(baseLetters('Mañana')).toBe('manana')
    expect(baseLetters('שלום')).toBe('שלומ')
    expect(alphabetFor('he', [])).toHaveLength(22)
  })

  it('judges records: higher is better, except memory moves', () => {
    expect(isRecord('pairs', 12, 10)).toBe(true)
    expect(isRecord('pairs', 8, 10)).toBe(false)
    expect(isRecord('memory', 9, 12)).toBe(true)
    expect(isRecord('memory', 14, 12)).toBe(false)
    expect(isRecord('memory', 14, 0)).toBe(true) // first game
  })

  it('builds odd-one-out questions from topics', () => {
    const tagged = (term: string, topic: string): Word => ({ ...word(term), tags: [topic] })
    const groups = topicGroups([tagged('pan', 'food'), tagged('queso', 'food'), tagged('leche', 'food'), tagged('tren', 'travel'), word('sin tema')])
    for (let i = 0; i < 20; i++) {
      const q = oddQuestion(groups)!
      expect(q.words).toHaveLength(4)
      expect(q.topic).toBe('food')
      expect(q.odd.term).toBe('tren')
    }
    expect(oddQuestion(topicGroups([tagged('pan', 'food'), tagged('queso', 'food'), tagged('leche', 'food')]))).toBeNull()
  })

  it('offers listening options with one right meaning and no repeats', () => {
    const w = (term: string, tr: string): Word => ({ ...word(term), translations: [tr] })
    const pool = [w('perro', 'כלב'), w('can', 'כלב'), w('gato', 'חתול'), w('casa', 'בית'), w('mesa', 'שולחן'), w('libro', 'ספר'), w('hogar', 'בית')]
    for (let i = 0; i < 20; i++) {
      const opts = listenOptions(pool[0], pool)
      expect(opts).toHaveLength(4)
      expect(opts.filter((o) => o.translations[0] === 'כלב')).toEqual([pool[0]])
      expect(new Set(opts.map((o) => o.translations[0])).size).toBe(4)
    }
  })

  it('shows a true or a wrong translation, never a synonym as wrong', () => {
    const w = (term: string, tr: string): Word => ({ ...word(term), translations: [tr] })
    const pool = [w('perro', 'כלב'), w('can', 'כלב'), w('gato', 'חתול')]
    expect(trueFalseFor(pool[0], pool, () => 0.1)).toMatchObject({ shown: 'כלב', truth: true })
    expect(trueFalseFor(pool[0], pool, () => 0.9)).toMatchObject({ shown: 'חתול', truth: false })
  })

  it('has plenty of sentences and el/la nouns in the Spanish courses', async () => {
    for (const course of COURSES.filter((c) => c.targetLang === 'es')) {
      const words = courseToWords(course, await course.load())
      const cloze = words.filter((w) => clozeFor(w)).length
      const gender = words.filter((w) => genderOf(w)).length
      console.log(course.id, words.length, 'sentences:', cloze, 'el/la:', gender)
      expect(cloze / words.length).toBeGreaterThan(0.3)
      expect(gender).toBeGreaterThan(20)
    }
  })
})
