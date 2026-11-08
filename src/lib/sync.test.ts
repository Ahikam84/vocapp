import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccountData, db, deleteWord, migrateFromV1 } from './db'
import { applyRemote, type RemoteRow } from './sync'

const word = (id: string, term: string) => ({ id, deckId: 'default', term, translations: ['x'], createdAt: 1 })

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('local change tracking', () => {
  it('stamps updatedAt on local writes and records deletions as tombstones', async () => {
    await db.words.add(word('w1', 'hola'))
    expect((await db.words.get('w1'))!.updatedAt).toBeGreaterThan(0)
    await deleteWord('w1')
    expect(await db.tombstones.get('words:w1')).toBeTruthy()
  })
})

describe('applyRemote (last write wins)', () => {
  const row = (term: string, t: number, deleted = false): RemoteRow => ({
    tbl: 'words', id: 'w1', data: deleted ? null : word('w1', term), deleted, client_updated_at: t, seq: 1,
  })

  it('takes a newer remote version and keeps its timestamp', async () => {
    await applyRemote([row('remote', 5000)])
    const w = await db.words.get('w1')
    expect(w!.term).toBe('remote')
    expect(w!.updatedAt).toBe(5000)
  })

  it('keeps a local edit that is newer than the remote one', async () => {
    await db.words.add(word('w1', 'local'))
    await applyRemote([row('remote', 1000)])
    expect((await db.words.get('w1'))!.term).toBe('local')
  })

  it('applies remote deletions, but not over a newer local edit', async () => {
    await db.words.add(word('w1', 'local'))
    await applyRemote([row('', 1000, true)])
    expect(await db.words.get('w1')).toBeTruthy()
    await applyRemote([row('', Date.now() + 1000, true)])
    expect(await db.words.get('w1')).toBeUndefined()
  })

  it('does not resurrect a word deleted locally after the remote edit', async () => {
    await db.words.add(word('w1', 'local'))
    await deleteWord('w1')
    await applyRemote([row('old remote', 1000)])
    expect(await db.words.get('w1')).toBeUndefined()
  })
})

describe('clearAccountData (sign-out)', () => {
  it("removes the account's courses and sync state but keeps device preferences", async () => {
    await db.decks.add({ id: 'd1', name: 'Unit 1', sourceLang: 'en', targetLang: 'he', createdAt: 1 })
    await db.words.add(word('w1', 'שלום'))
    await deleteWord('w1')
    await db.settings.bulkPut([
      { key: 'currentDeckId', value: 'd1' },
      { key: 'sync:userId', value: 'user-a' },
      { key: 'uiLang', value: 'en' },
      { key: 'migratedV1', value: true },
    ])

    await clearAccountData()

    expect(await db.decks.count()).toBe(0)
    expect(await db.tombstones.count()).toBe(0)
    expect((await db.settings.toArray()).map((s) => s.key).sort()).toEqual(['migratedV1', 'uiLang'])
  })
})

describe('migrateFromV1', () => {
  it('copies numeric-id data to UUIDs and maps the first deck to the default id', async () => {
    const old = new Dexie('vocapp')
    old.version(1).stores({ decks: '++id', words: '++id, deckId', progress: 'wordId, deckId', reviews: '++id, wordId', settings: 'key' })
    await old.table('decks').add({ name: 'ספרדית', sourceLang: 'he', targetLang: 'es', createdAt: 1 })
    await old.table('words').add({ deckId: 1, term: 'hola', translations: ['שלום'], createdAt: 1 })
    await old.table('progress').add({ wordId: 1, deckId: 1, learnedAt: 1, due: 2, lapses: 0, card: { due: '2026-01-01T00:00:00Z' } })
    await old.table('reviews').add({ wordId: 1, deckId: 1, mode: 'learn', exercise: 'typing', correct: true, responseMs: 1, at: 1 })
    old.close()

    await migrateFromV1()
    const [w] = await db.words.toArray()
    expect(w.deckId).toBe('default')
    expect(w.id).toMatch(/^[0-9a-f-]{36}$/)
    const p = await db.progress.get(w.id)
    expect(p!.card.due).toBeInstanceOf(Date)
    expect((await db.reviews.toArray())[0].wordId).toBe(w.id)
  })
})
