import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { MASCOT_SVG } from './mascotArt'
import './mascot.css'

/**
 * The cat and its plant. The plant is the learner's vocabulary; the cat looks after it:
 * waters it after a session, celebrates a reached goal, naps when nothing is due,
 * and swats the pot when the day is getting late without practice.
 */
export type MascotMood = 'idle' | 'water' | 'party' | 'sleep' | 'angry'

/** Words in long-term memory needed for each growth stage of the plant. */
const SEEDLING = 20
const FULL = 100

export function plantStage(longTerm: number): 'g1' | 'g2' | 'g3' {
  return longTerm >= FULL ? 'g3' : longTerm >= SEEDLING ? 'g2' : 'g1'
}

export function Mascot({ mood, size = 240 }: { mood: MascotMood; size?: number }) {
  // Grows with every word that has reached long-term memory, across all courses.
  const longTerm = useLiveQuery(async () => (await db.progress.toArray()).filter((p) => p.card.stability >= 21).length)
  return (
    <div
      className={`mascot ${mood} ${plantStage(longTerm ?? 0)}`}
      style={{ width: size, maxWidth: '100%' }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: MASCOT_SVG }}
    />
  )
}

/** Which mood fits the home screen right now. */
export function homeMood(opts: { goalDone: boolean; answeredToday: number; due: number; hour: number }): MascotMood {
  if (opts.goalDone) return 'party'
  if (opts.answeredToday === 0 && opts.hour >= 18) return 'angry'
  if (opts.due === 0) return 'sleep'
  return 'idle'
}
