import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Deck } from './db'
import { getSettings } from './settings'

/** The current course: undefined while loading, null when the user has none yet. */
export function useDeck(): Deck | null | undefined {
  return useLiveQuery(async () => {
    const { currentDeckId } = await getSettings()
    return ((currentDeckId != null ? await db.decks.get(currentDeckId) : undefined) ?? (await db.decks.orderBy('id').first())) ?? null
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
