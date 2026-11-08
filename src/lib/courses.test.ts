import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { COURSES } from '../courses'
import { db } from './db'
import { addCourse, courseToWords } from './courses'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('ready-made courses', () => {
  for (const course of COURSES)
    it(`${course.id}: every entry is complete and has a unique id`, async () => {
      const words = courseToWords(course, await course.load())
      const ids = new Set(words.map((w) => w.id))
      expect(ids.size).toBe(words.length)
      for (const w of words) {
        expect(w.term.trim(), w.id).toBe(w.term)
        expect(w.translations.every((t) => t.length > 0), w.id).toBe(true)
        expect(w.example, w.id).toBeTruthy()
        expect(w.exampleTranslation, w.id).toBeTruthy()
      }
    })

  it('adding a course twice keeps one copy and preserves user edits', async () => {
    const course = COURSES[0]
    const first = await addCourse(course)
    expect(first.added).toBeGreaterThan(100)
    const anyWord = (await db.words.where('deckId').equals(first.deckId).first())!
    await db.words.update(anyWord.id, { translations: ['תרגום שלי'] })

    const second = await addCourse(course)
    expect(second.added).toBe(0)
    expect(await db.words.where('deckId').equals(first.deckId).count()).toBe(first.added)
    expect((await db.words.get(anyWord.id))!.translations).toEqual(['תרגום שלי'])
    expect(await db.decks.count()).toBe(1)
  })
})
