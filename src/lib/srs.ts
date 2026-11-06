import { createEmptyCard, fsrs, Rating, type Grade } from 'ts-fsrs'
import { db, reviveCard, type ExerciseType, type Progress } from './db'

// Short-term (minutes-level) steps are handled by our own learning session,
// so FSRS only schedules day-level intervals.
const scheduler = fsrs({ enable_fuzz: true, enable_short_term: false, request_retention: 0.9 })

export { Rating }

/**
 * Turn an answer into an FSRS grade. Typed recall is stronger evidence than
 * picking from a list, and a fast answer means the memory is solid.
 */
export function gradeAnswer(opts: {
  correct: boolean
  almost: boolean
  exercise: ExerciseType
  responseMs: number
}): Grade {
  if (!opts.correct) return Rating.Again
  if (opts.almost || opts.responseMs > 15000) return Rating.Hard
  if (opts.exercise === 'typing' && opts.responseMs < 4000) return Rating.Easy
  return Rating.Good
}

/** Called when a word finishes the learning session – creates its first schedule. */
export async function markLearned(wordId: number, deckId: number, now = new Date()) {
  const card = scheduler.next(createEmptyCard(now), now, Rating.Good).card
  const progress: Progress = { wordId, deckId, learnedAt: now.getTime(), due: card.due.getTime(), lapses: 0, card }
  await db.progress.put(progress)
}

export async function recordReview(wordId: number, grade: Grade, now = new Date()) {
  const progress = await db.progress.get(wordId)
  if (!progress) return
  const card = scheduler.next(reviveCard(progress.card), now, grade).card
  await db.progress.put({
    ...progress,
    card,
    due: card.due.getTime(),
    lapses: progress.lapses + (grade === Rating.Again ? 1 : 0),
  })
}

/** Rough memory-strength bucket (0–5) used for the progress "plant" indicator. */
export function strength(progress: Progress | undefined): number {
  if (!progress) return 0
  const s = progress.card.stability
  if (s < 2) return 1
  if (s < 7) return 2
  if (s < 21) return 3
  if (s < 60) return 4
  return 5
}

export const DIFFICULT_LAPSES = 3
