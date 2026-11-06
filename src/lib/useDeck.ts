import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Deck } from './db'
import { getSettings } from './settings'

export function useDeck(): Deck | undefined {
  return useLiveQuery(async () => {
    const { currentDeckId } = await getSettings()
    return (currentDeckId != null ? await db.decks.get(currentDeckId) : undefined) ?? db.decks.orderBy('id').first()
  })
}

export const LANGUAGES: Record<string, string> = {
  es: 'ספרדית',
  ca: 'קטלאנית',
  en: 'אנגלית',
  fr: 'צרפתית',
  he: 'עברית',
}

/** Characters that are awkward to type on a Hebrew/English keyboard. */
export const SPECIAL_CHARS: Record<string, string[]> = {
  es: ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'],
  ca: ['à', 'è', 'é', 'í', 'ï', 'ò', 'ó', 'ú', 'ü', 'ç', 'l·l'],
  fr: ['à', 'â', 'ç', 'é', 'è', 'ê', 'ë', 'î', 'ï', 'ô', 'ù', 'û', 'œ'],
}
