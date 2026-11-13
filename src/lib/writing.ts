import type { Word } from './db'
import { HEBREW_NIKUD } from './answer'
import { getSettings, setSetting, useSettings } from './settings'

/**
 * Courses in another script (Arabic) come with a transliteration, so learners who can't write the
 * script can answer in transliteration instead: in Hebrew letters on Hebrew courses, in Latin
 * letters on English ones. The choice is kept per language.
 */
export type WritingMode = 'script' | 'reading'

/** What the learner writes for this word: the word itself, or its transliteration without vowel points. */
export function writtenForm(word: Pick<Word, 'term' | 'reading'>, mode: WritingMode): string {
  return mode === 'reading' && word.reading ? word.reading.replace(HEBREW_NIKUD, '') : word.term
}

/** The language whose letters the learner types: the course's, or the transliteration's (he / en). */
export function writingLang(word: Pick<Word, 'reading'>, mode: WritingMode, targetLang: string): string {
  if (mode !== 'reading' || !word.reading) return targetLang
  return /[֐-׿]/.test(word.reading) ? 'he' : 'en'
}

export function useWritingMode(lang: string): WritingMode {
  return useSettings()?.writing[lang] ?? 'script'
}

export async function writingModeFor(lang: string): Promise<WritingMode> {
  return (await getSettings()).writing[lang] ?? 'script'
}

export async function setWritingMode(lang: string, mode: WritingMode) {
  const { writing } = await getSettings()
  await setSetting('writing', { ...writing, [lang]: mode })
}
