import Dexie, { type EntityTable } from 'dexie'
import type { Card } from 'ts-fsrs'

export interface Deck {
  id: number
  name: string
  /** BCP-47 code of the language the user already knows, e.g. "he" */
  sourceLang: string
  /** BCP-47 code of the language being learned, e.g. "es" */
  targetLang: string
  createdAt: number
}

export interface Word {
  id: number
  deckId: number
  /** The word in the target language (what the user learns to produce) */
  term: string
  /** Accepted translations in the source language; the first one is shown */
  translations: string[]
  /** Extra accepted spellings of the term (synonyms, with/without article) */
  altTerms?: string[]
  example?: string
  exampleTranslation?: string
  /** Mnemonic / memory hint */
  hint?: string
  tags?: string[]
  createdAt: number
}

/** Exists only once a word has finished its first learning session. */
export interface Progress {
  wordId: number
  deckId: number
  learnedAt: number
  /** Next review time in ms – duplicated from card.due so Dexie can index it */
  due: number
  lapses: number
  card: Card
}

export type ExerciseType = 'intro' | 'choice-target' | 'choice-source' | 'audio-choice' | 'tiles' | 'typing'

export interface ReviewLog {
  id?: number
  wordId: number
  deckId: number
  mode: 'learn' | 'review' | 'practice'
  exercise: ExerciseType
  correct: boolean
  responseMs: number
  at: number
}

export interface Setting {
  key: string
  value: unknown
}

export const db = new Dexie('vocapp') as Dexie & {
  decks: EntityTable<Deck, 'id'>
  words: EntityTable<Word, 'id'>
  progress: EntityTable<Progress, 'wordId'>
  reviews: EntityTable<ReviewLog, 'id'>
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  decks: '++id',
  words: '++id, deckId, term, createdAt',
  progress: 'wordId, deckId, due, learnedAt',
  reviews: '++id, wordId, deckId, at',
  settings: 'key',
})

export async function ensureDefaultDeck(): Promise<number> {
  const first = await db.decks.orderBy('id').first()
  if (first) return first.id
  return db.decks.add({ name: 'ספרדית', sourceLang: 'he', targetLang: 'es', createdAt: Date.now() }) as Promise<number>
}

export async function deleteWord(wordId: number) {
  await db.transaction('rw', db.words, db.progress, db.reviews, async () => {
    await db.words.delete(wordId)
    await db.progress.delete(wordId)
    await db.reviews.where('wordId').equals(wordId).delete()
  })
}

/** Cards come back from IndexedDB with Date fields intact, but JSON backups turn them into strings. */
export function reviveCard(card: Card): Card {
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  }
}
