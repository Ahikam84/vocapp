import type { CourseInfo, CourseWords } from '../courses/types'
import { db, type Word } from './db'
import { stripAccents } from './answer'

export const courseDeckId = (courseId: string) => `course-${courseId}`

/** Stable word id from the course and term, e.g. "es-c1:a-raiz-de". */
export function courseWordId(courseId: string, term: string) {
  const slug = stripAccents(term.toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${courseId}:${slug}`
}

/** Round-robin across topics so a learning session mixes verbs, idioms, nouns… */
export function courseToWords(course: CourseInfo, data: CourseWords, now = Date.now()): Word[] {
  const topics = Object.entries(data)
  const longest = Math.max(...topics.map(([, entries]) => entries.length))
  const words: Word[] = []
  for (let i = 0; i < longest; i++)
    for (const [topic, entries] of topics) {
      const entry = entries[i]
      if (!entry) continue
      const [term, translations, example, exampleTranslation] = entry
      words.push({
        id: courseWordId(course.id, term),
        deckId: courseDeckId(course.id),
        term,
        translations: translations.split('/').map((t) => t.trim()),
        example,
        exampleTranslation,
        tags: [topic],
        createdAt: now + words.length,
      })
    }
  return words
}

/**
 * Add a ready-made course as a deck. Safe to run again: words already present
 * (including ones the user edited) are left alone and only new ones are added.
 * Deterministic ids mean adding it on two devices syncs into one copy.
 */
export async function addCourse(course: CourseInfo): Promise<{ deckId: string; added: number }> {
  const data = await course.load()
  const deckId = courseDeckId(course.id)
  const words = courseToWords(course, data)

  let added = 0
  await db.transaction('rw', db.decks, db.words, async () => {
    if (!(await db.decks.get(deckId)))
      await db.decks.add({
        id: deckId, name: course.name, sourceLang: course.sourceLang, targetLang: course.targetLang, createdAt: Date.now(),
      })
    const existing = new Set((await db.words.where('deckId').equals(deckId).primaryKeys()) as string[])
    const fresh = words.filter((w) => !existing.has(w.id))
    await db.words.bulkAdd(fresh)
    added = fresh.length
  })
  return { deckId, added }
}

export async function courseWordCount(course: CourseInfo) {
  return Object.values(await course.load()).reduce((n, entries) => n + entries.length, 0)
}
