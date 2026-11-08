import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Deck } from './db'
import { getSettings } from './settings'

/**
 * What the user is studying: one or more courses in the same language.
 * `deck` is the main one (language, pronunciation, where new words go by
 * default); `deckIds` are all courses whose words are practised together.
 */
export interface Study {
  deck: Deck
  decks: Deck[]
  deckIds: string[]
}

/** undefined while loading, null when the user has no course yet. */
export function useStudy(): Study | null | undefined {
  return useLiveQuery(async () => {
    const { currentDeckId, studyDeckIds } = await getSettings()
    const all = (await db.decks.toArray()).sort((a, b) => a.createdAt - b.createdAt)
    const deck = all.find((d) => d.id === currentDeckId) ?? all[0]
    if (!deck) return null
    // Choosing a single course elsewhere (outside the current set) drops back to just that course.
    const ids = studyDeckIds.includes(deck.id) ? studyDeckIds : [deck.id]
    const decks = all.filter((d) => ids.includes(d.id) && d.targetLang === deck.targetLang)
    return { deck, decks, deckIds: decks.map((d) => d.id) }
  })
}

/** Characters that are awkward to type on a Hebrew/English keyboard. */
export const SPECIAL_CHARS: Record<string, string[]> = {
  es: ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'],
  ca: ['à', 'è', 'é', 'í', 'ï', 'ò', 'ó', 'ú', 'ü', 'ç', 'l·l'],
  fr: ['à', 'â', 'ç', 'é', 'è', 'ê', 'ë', 'î', 'ï', 'ô', 'ù', 'û', 'œ'],
  it: ['à', 'è', 'é', 'ì', 'ò', 'ù'],
  de: ['ä', 'ö', 'ü', 'ß'],
  pt: ['á', 'â', 'ã', 'à', 'ç', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú'],
}

/** On-screen Hebrew keyboard rows (standard Israeli layout), for learners without one. */
export const HEBREW_KEYBOARD = [
  ['ק', 'ר', 'א', 'ט', 'ו', 'ן', 'ם', 'פ'],
  ['ש', 'ד', 'ג', 'כ', 'ע', 'י', 'ח', 'ל', 'ך', 'ף'],
  ['ז', 'ס', 'ב', 'ה', 'נ', 'מ', 'צ', 'ת', 'ץ'],
]

/** Letters added to the tiles exercise as decoys. */
export const DECOY_LETTERS: Record<string, string> = { he: 'אבגדהוילמנרשת' }
