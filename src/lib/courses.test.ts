import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { COURSES } from '../courses'
import type { CourseInfo, CourseWords } from '../courses/types'
import { db, markRemote } from './db'
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

  describe('course corrections', () => {
    let data: CourseWords
    const course: CourseInfo = {
      id: 'test', name: 'Test', description: '', level: 'A1', sourceLang: 'he', targetLang: 'es',
      load: async () => data,
    }
    const id = (term: string) => `test:${term}`
    beforeEach(() => {
      data = { t: [['uno', 'אחת', 'Uno.', 'אחת.'], ['dos', 'שתיים', 'Dos.', 'שתיים.'], ['tres', 'שלוש', 'Tres.', 'שלוש.']] }
    })

    it('reach words the user has not edited, and leave edited ones and "known" marks alone', async () => {
      await addCourse(course)
      await db.words.update(id('dos'), { translations: ['שתיים שלי'] })
      await db.words.update(id('tres'), { known: true })

      data = { t: [['uno', 'אחד', 'Uno.', 'אחד.'], ['dos', 'זוג', 'Dos.', 'שתיים.'], ['tres', 'שלושה', 'Tres.', 'שלוש.'], ['cuatro', 'ארבע', 'Cuatro.', 'ארבע.']] }
      const result = await addCourse(course)
      expect(result).toMatchObject({ added: 1, updated: 2 })
      expect((await db.words.get(id('uno')))!).toMatchObject({ translations: ['אחד'], exampleTranslation: 'אחד.' })
      expect((await db.words.get(id('dos')))!.translations).toEqual(['שתיים שלי'])
      expect((await db.words.get(id('tres')))!).toMatchObject({ translations: ['שלושה'], known: true })

      // A second correction still reaches a word updated by the first.
      data.t[0][1] = 'אחת/אחד'
      await addCourse(course)
      expect((await db.words.get(id('uno')))!.translations).toEqual(['אחת', 'אחד'])
    })

    it('treat words added before corrections existed as unedited only if never changed since', async () => {
      await addCourse(course)
      // Strip the fingerprint, as on words added by an older version; "dos" was edited a day later.
      // (Written as a sync would, so the database keeps these timestamps instead of stamping "now".)
      await db.transaction('rw', db.words, async (tx) => {
        markRemote(tx)
        await db.words.toCollection().modify((w) => { delete w.courseHash; w.updatedAt = w.createdAt })
        await db.words.where('id').equals(id('dos')).modify((w) => { w.updatedAt = w.createdAt + 86_400_000; w.translations = ['שתיים שלי'] })
      })

      data = { t: [['uno', 'אחד', 'Uno.', 'אחת.'], ['dos', 'זוג', 'Dos.', 'שתיים.'], ['tres', 'שלוש', 'Tres.', 'שלוש.']] }
      expect((await addCourse(course)).updated).toBe(1)
      expect((await db.words.get(id('uno')))!.translations).toEqual(['אחד'])
      expect((await db.words.get(id('dos')))!.translations).toEqual(['שתיים שלי'])
    })
  })
})
