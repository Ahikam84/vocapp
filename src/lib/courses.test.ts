import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { COURSES } from '../courses'
import { db } from './db'
import { addCourse, courseDeckId, courseToWords, renameCourseDecks } from './courses'

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

  it('ready-made courses in the same language do not repeat words', async () => {
    const seen = new Map<string, string>()
    const repeats: string[] = []
    for (const course of COURSES)
      for (const w of courseToWords(course, await course.load())) {
        const key = `${course.targetLang}:${w.term.toLowerCase()}`
        if (seen.has(key)) repeats.push(`${w.term} (${seen.get(key)} & ${course.id})`)
        else seen.set(key, course.id)
      }
    expect(repeats).toEqual([])
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

  it('renames decks still called by an old course name, but not ones the user renamed', async () => {
    await db.decks.bulkAdd([
      { id: courseDeckId('es-b1'), name: 'ספרדית B1', sourceLang: 'he', targetLang: 'es', createdAt: 1 },
      { id: courseDeckId('es-b2'), name: 'הספרדית שלי', sourceLang: 'he', targetLang: 'es', createdAt: 1 },
    ])
    await renameCourseDecks()
    expect((await db.decks.get(courseDeckId('es-b1')))!.name).toBe('ספרדית – רמת בינוניים')
    expect((await db.decks.get(courseDeckId('es-b2')))!.name).toBe('הספרדית שלי')
  })
})
