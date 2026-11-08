import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, setKnown } from './db'
import { joinSharedCourse, sharedDeckId, type SharedCourse } from './sharing'

const course = (code: string, words: [string, string][]): SharedCourse => ({
  code, name: `Unit ${code}`, sourceLang: 'en', targetLang: 'he',
  words: words.map(([term, tr], i) => ({ id: `w${i}`, term, translations: [tr] })),
})

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('joinSharedCourse', () => {
  it('adds several courses as separate decks', async () => {
    await joinSharedCourse(course('AAA111', [['שלום', 'hello']]))
    await joinSharedCourse(course('BBB222', [['כלב', 'dog'], ['חתול', 'cat']]))
    expect((await db.decks.toArray()).map((d) => d.id).sort()).toEqual([sharedDeckId('AAA111'), sharedDeckId('BBB222')])
    expect(await db.words.where('deckId').equals(sharedDeckId('BBB222')).count()).toBe(2)
  })

  it("applies the teacher's updates but keeps the student's known marks", async () => {
    const { deckId } = await joinSharedCourse(course('CCC333', [['שלום', 'hello']]))
    const [word] = await db.words.where('deckId').equals(deckId).toArray()
    await setKnown(word.id, true)

    const result = await joinSharedCourse(course('CCC333', [['שלום', 'hello/hi'], ['תודה', 'thanks']]))
    expect(result).toMatchObject({ added: 1, updated: 1 })
    const updated = await db.words.get(word.id)
    expect(updated!.translations).toEqual(['hello/hi'])
    expect(updated!.known).toBe(true)
  })
})
