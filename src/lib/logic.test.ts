import { describe, expect, it } from 'vitest'
import { checkAnswer } from './answer'
import { parseWordList } from './importText'
import { LearnSession } from './session'
import type { Word } from './db'

describe('checkAnswer', () => {
  it('accepts exact answers ignoring case and punctuation', () => {
    expect(checkAnswer('  Perro! ', ['perro']).result).toBe('correct')
  })
  it('treats missing accents and article as almost', () => {
    expect(checkAnswer('cancion', ['canción']).result).toBe('almost')
    expect(checkAnswer('casa', ['la casa']).result).toBe('almost')
  })
  it('allows one typo on longer words only', () => {
    expect(checkAnswer('manzna', ['manzana']).result).toBe('almost')
    expect(checkAnswer('sol', ['sal']).result).toBe('wrong')
  })
  it('ignores Hebrew nikud', () => {
    expect(checkAnswer('כֶּלֶב', ['כלב']).result).toBe('correct')
  })
})

describe('parseWordList', () => {
  it('parses several separators and swaps Hebrew-first lines', () => {
    const r = parseWordList('perro - כלב\nחתול\tgato\nla casa;בית/דירה;Mi casa;הבית שלי')
    expect(r.map((w) => w.term)).toEqual(['perro', 'gato', 'la casa'])
    expect(r[2].translations).toEqual(['בית', 'דירה'])
    expect(r[2].example).toBe('Mi casa')
  })
})

describe('LearnSession', () => {
  const words: Word[] = [1, 2, 3, 4, 5].map((id) => ({
    id, deckId: 1, term: `w${id}`, translations: [`t${id}`], createdAt: 0,
  }))

  it('finishes every word and never repeats a word back-to-back when avoidable', () => {
    const s = new LearnSession(words, { audio: true, choices: true })
    let last: number | null = null
    let steps = 0
    for (let step = s.next(); step; step = s.next()) {
      const active = s.items.filter((i) => !i.done).length
      if (active > 1 && step.exercise !== 'intro') expect(step.item.word.id).not.toBe(last)
      last = step.item.word.id
      s.answer(step.item, true)
      steps++
    }
    expect(s.finished).toBe(true)
    expect(steps).toBe(words.length * 6)
  })

  it('drops a level on a mistake but not below 1', () => {
    const s = new LearnSession(words.slice(0, 1), { audio: false, choices: true })
    const step = s.next()!
    s.answer(step.item, true)
    s.answer(step.item, false)
    expect(step.item.level).toBe(1)
  })
})
