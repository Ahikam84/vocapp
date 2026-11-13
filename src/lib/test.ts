import { db, newId, type ExerciseType, type ReviewLog, type TestRef, type Word } from './db'
import { clozeFor, clozeOptions, listenOptions, shuffled, trueFalseFor, type Cloze, type TrueFalse } from './games'
import { normalize } from './answer'
import { DIFFICULT_LAPSES } from './srs'

/**
 * Tests: a fixed set of mixed questions with a final score in percent.
 * Like the games, a test never changes the review schedule; words answered
 * wrong are only marked difficult, so they come up in difficult-word practice.
 */

export type TestLevel = TestRef['level']
export const TEST_LEVELS: TestLevel[] = ['easy', 'medium', 'hard']
export const TEST_LENGTHS = [10, 20, 30]
/** Learned words needed overall (for wrong options), and in the chosen set of words */
export const MIN_TEST_POOL = 6
export const MIN_TEST_WORDS = 3

export type QuestionKind =
  | 'choice-meaning' // the word → pick its meaning
  | 'choice-term' // the meaning → pick the word
  | 'truefalse'
  | 'match' // four words ↔ four meanings
  | 'listen' // hear the word → pick its meaning
  | 'cloze' // sentence with a blank → pick the word
  | 'type-meaning' // the word → type its meaning
  | 'type-term' // the meaning → type the word
  | 'cloze-type' // sentence with a blank → type the word
  | 'dictation' // hear the word → type it

/** How often each kind of question comes up, per level: recognition when easy, recall when hard. */
export const MIX: Record<TestLevel, Partial<Record<QuestionKind, number>>> = {
  easy: { 'choice-meaning': 3, 'choice-term': 2, truefalse: 2, match: 1, listen: 2 },
  medium: { 'choice-term': 2, cloze: 2, 'type-meaning': 2, 'type-term': 2, listen: 1, truefalse: 1 },
  hard: { 'type-term': 4, 'cloze-type': 2, dictation: 2, 'type-meaning': 2 },
}

/** What a kind turns into when it can't be asked about a word (no sentence, no voice). */
const FALLBACK: Partial<Record<QuestionKind, QuestionKind>> = {
  cloze: 'choice-term',
  'cloze-type': 'type-term',
  listen: 'choice-meaning',
  dictation: 'type-term',
  match: 'choice-meaning',
}

export const TYPED: QuestionKind[] = ['type-meaning', 'type-term', 'cloze-type', 'dictation']

export interface TestQuestion {
  kind: QuestionKind
  word: Word
  /** choice-meaning, choice-term, listen */
  options?: Word[]
  /** cloze, cloze-type */
  cloze?: Cloze
  clozeOptions?: string[]
  truefalse?: TrueFalse
  /** match: the four words, in order (the meanings are shuffled on screen) */
  pairs?: Word[]
}

/** Spreads the level's mix over `count` questions: each kind gets its share, in random order. */
function kindsFor(level: TestLevel, count: number): QuestionKind[] {
  const mix = Object.entries(MIX[level]) as [QuestionKind, number][]
  const total = mix.reduce((n, [, w]) => n + w, 0)
  const kinds: QuestionKind[] = []
  // Largest remainder, so the shares add up to exactly `count`
  const shares = mix.map(([k, w]) => ({ k, exact: (w / total) * count }))
  for (const s of shares) for (let i = 0; i < Math.floor(s.exact); i++) kinds.push(s.k)
  for (const s of [...shares].sort((a, b) => (b.exact % 1) - (a.exact % 1))) if (kinds.length < count) kinds.push(s.k)
  return shuffled(kinds)
}

/** Up to three other words with different meanings, for a matching question. */
function matchPartners(word: Word, pool: Word[]): Word[] {
  const seen = new Set([normalize(word.translations[0]), normalize(word.term)])
  const out: Word[] = []
  for (const w of shuffled(pool)) {
    const a = normalize(w.translations[0])
    const b = normalize(w.term)
    if (w.id === word.id || seen.has(a) || seen.has(b)) continue
    seen.add(a).add(b)
    out.push(w)
    if (out.length === 3) break
  }
  return out
}

/**
 * The questions of a test: one per word (as many words as asked for, if there are enough),
 * each word asked in one way. `pool` is every learned word, for the wrong options.
 */
/**
 * `transliteration`: the learner writes in transliteration, so no "type the word as the sentence has
 * it" question for words that have one – the sentence's form of the word has no transliteration.
 */
export function buildTest(words: Word[], pool: Word[], level: TestLevel, count: number, audio: boolean, transliteration = false): TestQuestion[] {
  const chosen = shuffled(words).slice(0, count)
  const kinds = kindsFor(level, chosen.length)
  return chosen.map((word, i) => {
    let kind = kinds[i]
    const cloze = clozeFor(word)
    for (let guard = 0; guard < 3; guard++) {
      const impossible =
        ((kind === 'cloze' || kind === 'cloze-type') && !cloze) ||
        (kind === 'cloze-type' && transliteration && !!word.reading) ||
        ((kind === 'listen' || kind === 'dictation') && !audio) ||
        (kind === 'match' && matchPartners(word, pool).length < 3)
      if (!impossible) break
      kind = FALLBACK[kind]!
    }
    const q: TestQuestion = { kind, word }
    if (kind === 'choice-meaning' || kind === 'choice-term' || kind === 'listen') q.options = listenOptions(word, pool)
    if (kind === 'cloze' || kind === 'cloze-type') q.cloze = cloze!
    if (kind === 'cloze') q.clozeOptions = clozeOptions(cloze!, pool)
    if (kind === 'truefalse') q.truefalse = trueFalseFor(word, pool)
    if (kind === 'match') q.pairs = [word, ...matchPartners(word, pool)]
    return q
  })
}

/** One word's result within a question (a matching question has four). */
export interface ItemResult {
  word: Word
  correct: boolean
  almost?: boolean
  /** What was typed or chosen, for the list of mistakes */
  given?: string
}

/** A question's score from 0 to 1: a right answer is 1, an almost-right one ½, each matched pair its share. */
export function questionScore(items: Pick<ItemResult, 'correct' | 'almost'>[]): number {
  if (!items.length) return 0
  return items.reduce((n, r) => n + (r.correct ? (r.almost ? 0.5 : 1) : 0), 0) / items.length
}

/** The final score in percent. */
export function testPercent(scores: number[], questions = scores.length): number {
  return questions ? Math.round((scores.reduce((a, b) => a + b, 0) / questions) * 100) : 0
}

const EXERCISE: Record<QuestionKind, ExerciseType> = {
  'choice-meaning': 'choice-target',
  'choice-term': 'choice-source',
  truefalse: 'choice-target',
  match: 'choice-target',
  listen: 'audio-choice',
  cloze: 'choice-source',
  'type-meaning': 'typing',
  'type-term': 'typing',
  'cloze-type': 'typing',
  dictation: 'typing',
}

/** Logs a question's answers (they count for the daily goal, streak and medals, not for the schedule). */
export async function logTestAnswer(ref: TestRef, kind: QuestionKind, items: ItemResult[], responseMs: number) {
  const at = Date.now()
  await db.reviews.bulkAdd(
    items.map((r) => ({
      id: newId(),
      wordId: r.word.id,
      deckId: r.word.deckId,
      mode: 'test' as const,
      exercise: EXERCISE[kind],
      correct: r.correct,
      almost: !!r.almost,
      responseMs: Math.round(Math.min(responseMs, 120_000)),
      at,
      test: ref,
    })),
  )
}

/** Words answered wrong are marked difficult (missed often enough), so difficult-word practice picks them up. */
export async function markDifficult(wordIds: string[]) {
  await db.transaction('rw', db.progress, async () => {
    for (const id of new Set(wordIds)) {
      const p = await db.progress.get(id)
      if (p && p.lapses < DIFFICULT_LAPSES) await db.progress.update(id, { lapses: DIFFICULT_LAPSES })
    }
  })
}

export interface TestSummary {
  id: string
  at: number
  level: TestLevel
  questions: number
  percent: number
}

/** Finished tests (every question answered), oldest first, worked out from the logged answers. */
export function testHistory(reviews: Pick<ReviewLog, 'correct' | 'almost' | 'at' | 'test'>[]): TestSummary[] {
  const tests = new Map<string, { ref: TestRef; at: number; byQ: Map<number, Pick<ReviewLog, 'correct' | 'almost'>[]> }>()
  for (const r of reviews) {
    if (!r.test) continue
    let x = tests.get(r.test.id)
    if (!x) tests.set(r.test.id, (x = { ref: r.test, at: r.at, byQ: new Map() }))
    x.at = Math.max(x.at, r.at)
    x.byQ.set(r.test.q, [...(x.byQ.get(r.test.q) ?? []), r])
  }
  return [...tests.values()]
    .filter((x) => x.byQ.size === x.ref.questions)
    .map((x) => ({
      id: x.ref.id,
      at: x.at,
      level: x.ref.level,
      questions: x.ref.questions,
      percent: testPercent([...x.byQ.values()].map(questionScore), x.ref.questions),
    }))
    .sort((a, b) => a.at - b.at)
}
