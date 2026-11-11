import { COURSES } from '../courses'
import type { CourseInfo, CourseWords } from '../courses/types'
import { db, type Word } from './db'
import { ARABIC_MARKS, stripAccents } from './answer'
import { audioKey } from './audioKey'

export const courseDeckId = (courseId: string) => `course-${courseId}`

/** Stable word id from the course and term, e.g. "es-c1:a-raiz-de". */
export function courseWordId(courseId: string, term: string) {
  const latin = stripAccents(term.toLowerCase())
  // Latin terms keep their a-z slugs. Other scripts (Arabic) keep their own letters, only without
  // vowel marks – and nothing else, so ids never change when answer checking gets looser.
  const slug = /[^\P{L}a-z]/u.test(latin)
    ? term.toLowerCase().replace(ARABIC_MARKS, '').replace(/[^\p{L}\p{N}]+/gu, '-')
    : latin.replace(/[^a-z0-9]+/g, '-')
  return `${courseId}:${slug.replace(/^-|-$/g, '')}`
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
      const [term, translations, example, exampleTranslation, reading, exampleReading] = entry
      words.push({
        ...(reading ? { reading, exampleReading } : {}),
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

/** The parts of a course word that a course correction may change. */
function courseContent(w: Word) {
  return {
    translations: w.translations, example: w.example, exampleTranslation: w.exampleTranslation,
    reading: w.reading, exampleReading: w.exampleReading, tags: w.tags,
  }
}
const contentHash = (w: Word) => audioKey(JSON.stringify(courseContent(w)))

/** Words copied in before courseHash existed and never changed since count as unedited. */
const UNTOUCHED_MS = 5 * 60_000

/**
 * Add a ready-made course as a deck, or bring it up to date. Safe to run again: new words are added,
 * and corrections to the course reach words the user hasn't edited – their own edits, "already known"
 * marks and progress are kept. Deterministic ids mean adding it on two devices syncs into one copy.
 */
export async function addCourse(course: CourseInfo): Promise<{ deckId: string; added: number; updated: number }> {
  const data = await course.load()
  const deckId = courseDeckId(course.id)
  const words = courseToWords(course, data).map((w) => ({ ...w, courseHash: contentHash(w) }))

  let added = 0
  let updated = 0
  await db.transaction('rw', db.decks, db.words, async () => {
    if (!(await db.decks.get(deckId)))
      await db.decks.add({
        id: deckId, name: course.name, sourceLang: course.sourceLang, targetLang: course.targetLang, createdAt: Date.now(),
      })
    const existing = new Map((await db.words.where('deckId').equals(deckId).toArray()).map((w) => [w.id, w]))
    const fresh = words.filter((w) => !existing.has(w.id))
    await db.words.bulkAdd(fresh)
    added = fresh.length

    for (const w of words) {
      const mine = existing.get(w.id)
      if (!mine) continue
      const current = contentHash(mine)
      const unedited = mine.courseHash
        ? mine.courseHash === current
        : (mine.updatedAt ?? mine.createdAt) - mine.createdAt < UNTOUCHED_MS
      if (!unedited) continue
      if (current !== w.courseHash) {
        await db.words.update(w.id, { ...courseContent(w), courseHash: w.courseHash })
        updated++
      } else if (mine.courseHash !== w.courseHash) {
        await db.words.update(w.id, { courseHash: w.courseHash }) // older copy: remember it is unedited
      }
    }
  })
  return { deckId, added, updated }
}

/**
 * Bring every ready-made course the user has up to date – once per app version, in the background,
 * so corrections and new words reach students without them having to look for updates.
 */
export async function refreshCourses(version: string) {
  const key = 'coursesRefreshedFor'
  const done = await db.settings.get(key)
  if (done?.value === version) return
  for (const course of COURSES)
    if (await db.decks.get(courseDeckId(course.id))) await addCourse(course)
  await db.settings.put({ key, value: version })
}

export async function courseWordCount(course: CourseInfo) {
  return Object.values(await course.load()).reduce((n, entries) => n + entries.length, 0)
}

/** Names the courses had before levels got Hebrew names, e.g. "ספרדית B1". */
const OLD_COURSE_NAMES: Record<string, string> = {
  'es-b1': 'ספרדית B1', 'es-b2': 'ספרדית B2', 'es-c1': 'ספרדית C1', 'es-c2': 'ספרדית C2',
  'ar-lev-b1': 'ערבית מדוברת B1', 'ar-lev-b2': 'ערבית מדוברת B2',
  'ar-lev-c1': 'ערבית מדוברת C1', 'ar-lev-c2': 'ערבית מדוברת C2',
}

/** Give course decks added under an old name the new one – unless the user renamed the deck themselves. */
export async function renameCourseDecks() {
  for (const course of COURSES) {
    const old = OLD_COURSE_NAMES[course.id]
    if (!old) continue
    const deckId = courseDeckId(course.id)
    const deck = await db.decks.get(deckId)
    if (deck?.name === old) await db.decks.update(deckId, { name: course.name })
  }
}
