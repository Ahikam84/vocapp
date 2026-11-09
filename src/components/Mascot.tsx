import { useLiveQuery } from 'dexie-react-hooks'
import angry from '../assets/mascot/angry.webp'
import catBlink from '../assets/mascot/cat-blink.webp'
import cat from '../assets/mascot/cat.webp'
import party from '../assets/mascot/party.webp'
import pot1 from '../assets/mascot/pot1.webp'
import pot2 from '../assets/mascot/pot2.webp'
import pot3 from '../assets/mascot/pot3.webp'
import sleep from '../assets/mascot/sleep.webp'
import water from '../assets/mascot/water.webp'
import { db } from '../lib/db'
import './mascot.css'

/**
 * The cat and its plant. The plant is the learner's vocabulary; the cat looks after it:
 * waters it after a session, celebrates a reached goal, naps when nothing is due,
 * and swats the pot when the day is getting late without practice.
 */
export type MascotMood = 'idle' | 'water' | 'party' | 'sleep' | 'angry'

const POSES: Record<Exclude<MascotMood, 'idle'>, string> = { water, party, sleep, angry }

/** The resting scene is put together from parts so the plant can grow and the cat can blink. */
const SCENE_W = 470
const POTS = [
  { src: pot1, w: 115 },
  { src: pot2, w: 115 },
  { src: pot3, w: 157 },
]
const CAT_W = 300

/** Words in long-term memory needed for each growth stage of the plant. */
const SEEDLING = 20
const FULL = 100

export function plantStage(longTerm: number): 0 | 1 | 2 {
  return longTerm >= FULL ? 2 : longTerm >= SEEDLING ? 1 : 0
}

export function Mascot({ mood, size = 240 }: { mood: MascotMood; size?: number }) {
  // Grows with every word that has reached long-term memory, across all courses.
  const longTerm = useLiveQuery(async () => (await db.progress.toArray()).filter((p) => p.card.stability >= 21).length)
  const pot = POTS[plantStage(longTerm ?? 0)]
  return (
    <div className={`mascot ${mood}`} style={{ width: size }} aria-hidden="true">
      {/* key: replay the pop-in whenever the mood changes */}
      <div className="m-stage" key={mood}>
        {mood === 'idle' ? (
          <div className="m-scene">
            <div className="m-cat" style={{ width: `${(CAT_W / SCENE_W) * 100}%` }}>
              <img src={cat} alt="" draggable={false} />
              <img src={catBlink} alt="" className="m-blink" draggable={false} />
            </div>
            <img src={pot.src} alt="" className="m-pot" style={{ width: `${(pot.w / SCENE_W) * 100}%` }} draggable={false} />
          </div>
        ) : (
          <img src={POSES[mood]} alt="" className="m-pose" draggable={false} />
        )}
      </div>
    </div>
  )
}

/** Which mood fits the home screen right now. */
export function homeMood(opts: { goalDone: boolean; answeredToday: number; due: number; hour: number }): MascotMood {
  if (opts.goalDone) return 'party'
  if (opts.answeredToday === 0 && opts.hour >= 18) return 'angry'
  if (opts.due === 0) return 'sleep'
  return 'idle'
}
