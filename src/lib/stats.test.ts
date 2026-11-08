import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, setKnown } from './db'
import { markLearned } from './srs'
import { studyStats } from './stats'

const word = (id: string, deckId: string) => ({ id, deckId, term: id, translations: ['x'], createdAt: 1 })

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.words.bulkAdd([word('a1', 'A'), word('a2', 'A'), word('b1', 'B'), word('c1', 'C')])
})

describe('studyStats', () => {
  it('counts words from all studied courses and nothing else', async () => {
    await markLearned('a1', 'A')
    await markLearned('b1', 'B')
    await setKnown('a2', true)
    const stats = await studyStats(['A', 'B'])
    expect(stats).toMatchObject({ total: 3, learned: 2, known: 1, newWords: 0 })
  })

  it('matches single-course stats when one course is studied', async () => {
    const stats = await studyStats(['C'])
    expect(stats).toMatchObject({ total: 1, learned: 0, newWords: 1 })
  })
})
