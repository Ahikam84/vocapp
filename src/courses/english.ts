import { hebrewToLatin } from '../lib/translit'
import type { CourseEntry, CourseWords, EnglishVersion } from './types'

/**
 * Build the English version of a course from the Hebrew one: English translations in place of the
 * Hebrew, and for Arabic a Latin transliteration in place of the Hebrew one. Words without an
 * English entry are left out (a test makes sure there are none).
 */
export async function inEnglish(hebrew: Promise<CourseWords>, english: Promise<EnglishVersion>): Promise<CourseWords> {
  const [he, en] = await Promise.all([hebrew, english])
  const out: CourseWords = {}
  for (const [topic, entries] of Object.entries(he)) {
    const words: CourseEntry[] = []
    for (const [term, , example, , reading, exampleReading] of entries) {
      const e = en.words[term]
      if (!e) continue
      const [translations, exampleTranslation, enReading, enExampleReading] = e
      words.push(
        reading
          ? [term, translations, example, exampleTranslation, enReading ?? hebrewToLatin(reading), enExampleReading ?? hebrewToLatin(exampleReading ?? '')]
          : [term, translations, example, exampleTranslation],
      )
    }
    out[en.topics[topic] ?? topic] = words
  }
  return out
}
