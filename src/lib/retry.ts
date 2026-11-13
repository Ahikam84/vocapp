import type { ExerciseType } from './db'

/**
 * Steps back to typed recall for a word that was missed in this session, from easiest to hardest:
 * recognise the word, pick it from its translation, build it from letters, type it.
 */
const LADDER: ExerciseType[] = ['choice-target', 'choice-source', 'tiles', 'typing']

/**
 * The next exercise for a word in this session after an answer, or null when it's done.
 * A miss steps two rungs down (one rung from the lower ones), so a word you don't know comes back
 * as an easier question instead of the same hard one; each right answer climbs back up, until it's
 * typed right. Without enough words for multiple choice, it starts from building with letters.
 */
export function nextRetry(exercise: ExerciseType, correct: boolean, choices: boolean): ExerciseType | null {
  const at = Math.max(0, LADDER.indexOf(exercise))
  const lowest = choices ? 0 : 2
  if (correct) return exercise === 'typing' ? null : LADDER[Math.max(lowest, at + 1)]
  return LADDER[Math.max(lowest, at >= 2 ? at - 2 : at - 1)]
}
