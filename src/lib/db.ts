import Dexie, { type EntityTable, type Transaction } from 'dexie'
import type { Card } from 'ts-fsrs'

/**
 * Records that sync to the cloud carry a string UUID id (so two devices never
 * collide) and an updatedAt timestamp (ms) used for last-write-wins.
 */
interface Synced {
  updatedAt?: number
}

export interface Deck extends Synced {
  id: string
  name: string
  /** BCP-47 code of the language the user already knows, e.g. "he" */
  sourceLang: string
  /** BCP-47 code of the language being learned, e.g. "es" */
  targetLang: string
  createdAt: number
}

export interface Word extends Synced {
  id: string
  deckId: string
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
  /** "I already know this word" – skipped by learning and reviews until restored */
  known?: boolean
  createdAt: number
}

/** Exists only once a word has finished its first learning session. */
export interface Progress extends Synced {
  wordId: string
  deckId: string
  learnedAt: number
  /** Next review time in ms – duplicated from card.due so Dexie can index it */
  due: number
  lapses: number
  card: Card
}

export type ExerciseType = 'intro' | 'choice-target' | 'choice-source' | 'audio-choice' | 'tiles' | 'typing'

export interface ReviewLog extends Synced {
  id: string
  wordId: string
  deckId: string
  mode: 'learn' | 'review' | 'practice'
  exercise: ExerciseType
  correct: boolean
  responseMs: number
  at: number
}

/** Device-local settings – never synced (e.g. voice choice depends on the device). */
export interface Setting {
  key: string
  value: unknown
}

/** Remembers deletions until they have been pushed to the cloud. */
export interface Tombstone {
  key: string
  tbl: SyncedTable
  id: string
  updatedAt: number
}

export const SYNCED_TABLES = ['decks', 'words', 'progress', 'reviews'] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]

export const db = new Dexie('vocapp-v2') as Dexie & {
  decks: EntityTable<Deck, 'id'>
  words: EntityTable<Word, 'id'>
  progress: EntityTable<Progress, 'wordId'>
  reviews: EntityTable<ReviewLog, 'id'>
  settings: EntityTable<Setting, 'key'>
  tombstones: EntityTable<Tombstone, 'key'>
}

db.version(1).stores({
  decks: 'id, updatedAt',
  words: 'id, deckId, term, createdAt, updatedAt',
  progress: 'wordId, deckId, due, learnedAt, updatedAt',
  reviews: 'id, wordId, deckId, at, updatedAt',
  settings: 'key',
  tombstones: 'key, updatedAt',
})

export const newId = () => crypto.randomUUID()

/** The first deck has a fixed id so a fresh device doesn't create a duplicate before its first sync. */
export const DEFAULT_DECK_ID = 'default'

/** Writes made while applying data pulled from the cloud must keep the remote timestamp. */
export function markRemote(tx: Transaction) {
  ;(tx as Transaction & { remote?: boolean }).remote = true
}
const isRemote = (tx: Transaction) => !!(tx as Transaction & { remote?: boolean }).remote

let onLocalChange = () => {}
export function setLocalChangeListener(fn: () => void) {
  onLocalChange = fn
}

for (const name of SYNCED_TABLES) {
  const table = db.table(name)
  table.hook('creating', (_key, obj, tx) => {
    if (isRemote(tx)) return
    obj.updatedAt = Date.now()
    onLocalChange()
  })
  table.hook('updating', (_mods, _key, _obj, tx) => {
    if (isRemote(tx)) return
    onLocalChange()
    return { updatedAt: Date.now() }
  })
}

async function addTombstones(tbl: SyncedTable, ids: string[]) {
  const now = Date.now()
  await db.tombstones.bulkPut(ids.map((id) => ({ key: `${tbl}:${id}`, tbl, id, updatedAt: now })))
  onLocalChange()
}

export async function ensureDefaultDeck(): Promise<string> {
  const first = await db.decks.orderBy('id').first()
  if (first) return first.id
  // Written as "remote" with updatedAt 0 so any copy already in the cloud wins over this placeholder.
  await db.transaction('rw', db.decks, async (tx) => {
    markRemote(tx)
    await db.decks.add({ id: DEFAULT_DECK_ID, name: 'ספרדית', sourceLang: 'he', targetLang: 'es', createdAt: 0, updatedAt: 0 })
  })
  return DEFAULT_DECK_ID
}

export async function deleteWord(wordId: string) {
  await db.transaction('rw', [db.words, db.progress, db.reviews, db.tombstones], async () => {
    const reviewIds = (await db.reviews.where('wordId').equals(wordId).primaryKeys()) as string[]
    await db.words.delete(wordId)
    await db.progress.delete(wordId)
    await db.reviews.bulkDelete(reviewIds)
    await addTombstones('words', [wordId])
    await addTombstones('progress', [wordId])
    await addTombstones('reviews', reviewIds)
  })
}

/** Mark a word as already known (or bring it back). Its review schedule is kept for if it returns. */
export async function setKnown(wordId: string, known: boolean) {
  await db.words.update(wordId, { known })
}

export async function resetProgress(wordId: string) {
  await db.transaction('rw', [db.progress, db.tombstones], async () => {
    await db.progress.delete(wordId)
    await addTombstones('progress', [wordId])
  })
}

/** Cards come back from IndexedDB with Date fields intact, but JSON (backups, cloud) turns them into strings. */
export function reviveCard(card: Card): Card {
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  }
}

interface LegacyData {
  decks: (Omit<Deck, 'id'> & { id: number | string })[]
  words: (Omit<Word, 'id' | 'deckId'> & { id: number | string; deckId: number | string })[]
  progress: (Omit<Progress, 'wordId' | 'deckId'> & { wordId: number | string; deckId: number | string })[]
  reviews: (Omit<ReviewLog, 'id' | 'wordId' | 'deckId'> & { id?: number | string; wordId: number | string; deckId: number | string })[]
  settings?: Setting[]
}

/**
 * Write data that may use the old numeric ids (v1 database or an old backup)
 * into the current database, converting ids to UUIDs. The first deck becomes the default deck.
 */
export async function importData(data: LegacyData) {
  const deckIds = new Map<string, string>()
  const wordIds = new Map<string, string>()
  const convert = (map: Map<string, string>, id: number | string, fallback?: string) => {
    const key = String(id)
    if (!map.has(key)) map.set(key, typeof id === 'string' && id.length > 8 ? id : (fallback ?? newId()))
    return map.get(key)!
  }
  const firstDeck = [...data.decks].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))[0]
  if (firstDeck) convert(deckIds, firstDeck.id, DEFAULT_DECK_ID)

  await db.transaction('rw', [db.decks, db.words, db.progress, db.reviews, db.settings], async () => {
    await db.decks.bulkPut(data.decks.map((d) => ({ ...d, id: convert(deckIds, d.id) })))
    await db.words.bulkPut(
      data.words.map((w) => ({ ...w, id: convert(wordIds, w.id), deckId: convert(deckIds, w.deckId) })),
    )
    await db.progress.bulkPut(
      data.progress.map((p) => ({
        ...p, wordId: convert(wordIds, p.wordId), deckId: convert(deckIds, p.deckId), card: reviveCard(p.card),
      })),
    )
    await db.reviews.bulkPut(
      data.reviews.map((r) => ({
        ...r,
        id: typeof r.id === 'string' && r.id.length > 8 ? r.id : newId(),
        wordId: convert(wordIds, r.wordId),
        deckId: convert(deckIds, r.deckId),
      })),
    )
    // Only device-level preferences carry over; deck selection uses the new ids.
    for (const s of data.settings ?? []) if (s.key !== 'currentDeckId') await db.settings.put(s)
  })
}

/** One-time move from the v1 database (numeric ids) to this one. The old database is left untouched. */
export async function migrateFromV1() {
  if ((await db.settings.get('migratedV1')) || !(await Dexie.exists('vocapp'))) return
  const old = new Dexie('vocapp')
  try {
    await old.open()
    const read = (t: string) => (old.tables.some((x) => x.name === t) ? old.table(t).toArray() : Promise.resolve([]))
    const [decks, words, progress, reviews, settings] = await Promise.all(
      ['decks', 'words', 'progress', 'reviews', 'settings'].map(read),
    )
    if (decks.length) await importData({ decks, words, progress, reviews, settings })
  } finally {
    old.close()
  }
  await db.settings.put({ key: 'migratedV1', value: true })
}
