import { describe, expect, it } from 'vitest'
import { COURSES } from '../courses'
import { acceptedTerms, checkAnswer, normalize } from './answer'
import { audioKey } from './audioKey'
import { courseToWords, courseWordId } from './courses'

describe('Arabic courses', () => {
  it('keeps Arabic letters in word ids, and Spanish ids as they were', () => {
    expect(courseWordId('ar-lev-b1', 'على طول')).toBe('ar-lev-b1:على-طول')
    expect(courseWordId('ar-lev-b1', 'هلّأ')).toBe('ar-lev-b1:هلأ')
    expect(courseWordId('es-b1', '¿Qué tal?')).toBe('es-b1:que-tal')
  })

  it('accepts the Arabic, with or without shadda, and the transliteration however it is typed', () => {
    const word = { term: 'سلامتك', reading: 'סַלַאמְתַכּ' }
    const ok = (typed: string) => checkAnswer(typed, acceptedTerms(word)).result
    expect(ok('سلامتك')).toBe('correct')
    expect(ok('סלאמתכ')).toBe('correct')
    expect(ok('סלאמתך')).toBe('correct')
    expect(checkAnswer('هلأ', acceptedTerms({ term: 'هلّأ' })).result).toBe('correct')
    const kh = { term: 'خلاص', reading: "ח'לַאץ" }
    expect(checkAnswer("ח'לאץ", acceptedTerms(kh)).result).toBe('correct')
    expect(checkAnswer('חלאץ', acceptedTerms(kh)).result).toBe('correct')
    expect(checkAnswer('חלאצ', acceptedTerms(kh)).result).toBe('correct')
  })

  const arabic = COURSES.filter((c) => c.targetLang === 'ar' && c.sourceLang === 'he')

  for (const course of arabic)
    it(`${course.id}: every word has a transliteration of the word and its example`, async () => {
      const words = courseToWords(course, await course.load())
      expect(words.length).toBeGreaterThan(200)
      for (const w of words) {
        expect(w.reading, w.term).toMatch(/[א-ת]/)
        expect(w.exampleReading, w.term).toMatch(/[א-ת]/)
        expect(w.term, w.term).toMatch(/[ء-ي]/)
      }
    })

  it('does not repeat a word across levels, even spelled with or without shadda', async () => {
    const seen = new Map<string, string>()
    const repeats: string[] = []
    for (const course of arabic)
      for (const w of courseToWords(course, await course.load())) {
        const key = normalize(w.term)
        if (seen.has(key)) repeats.push(`${w.term} (${seen.get(key)} & ${course.id})`)
        else seen.set(key, course.id)
      }
    expect(repeats).toEqual([])
  })
})

describe('recorded Arabic audio', () => {
  it('gives every course text its own file name', async () => {
    const texts = new Set<string>()
    for (const course of COURSES.filter((c) => c.targetLang === 'ar'))
      for (const w of courseToWords(course, await course.load())) {
        texts.add(w.term.trim())
        if (w.example) texts.add(w.example.trim())
      }
    const keys = new Set([...texts].map(audioKey))
    expect(keys.size).toBe(texts.size)
    expect(audioKey(' هلّأ ')).toBe(audioKey('هلّأ'))
    expect(audioKey('هلّأ')).toMatch(/^[0-9a-z]+$/)
  })
})

describe('writing in transliteration', () => {
  it('gives the word, or its transliteration without vowel points, and the letters it is typed in', async () => {
    const { writtenForm, writingLang } = await import('./writing')
    const he = { term: 'خلاص', reading: "ח'לַאץ" }
    const en = { term: 'خلاص', reading: 'khalas' }
    expect(writtenForm(he, 'script')).toBe('خلاص')
    expect(writtenForm(he, 'reading')).toBe("ח'לאץ")
    expect(writtenForm(en, 'reading')).toBe('khalas')
    expect(writingLang(he, 'reading', 'ar')).toBe('he')
    expect(writingLang(en, 'reading', 'ar')).toBe('en')
    expect(writingLang({}, 'reading', 'es')).toBe('es')
    // Built from tiles of the transliteration, it is a right answer
    expect(checkAnswer(writtenForm(he, 'reading'), acceptedTerms(he)).result).toBe('correct')
  })

  it('asks no "type the sentence\'s form" questions in transliteration mode', async () => {
    const { buildTest } = await import('./test')
    const course = COURSES.find((c) => c.id === 'ar-lev-b1')!
    const words = courseToWords(course, await course.load())
    for (let i = 0; i < 5; i++) {
      const kinds = buildTest(words, words, 'hard', 30, true, true).map((q) => q.kind)
      expect(kinds).not.toContain('cloze-type')
    }
  })
})
