import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Exercise, { type ExerciseOutcome } from '../components/Exercise'
import { ProgressBar } from '../components/common'
import { db, type Deck, type ExerciseType, type Word } from '../lib/db'
import { getSettings, type Settings } from '../lib/settings'
import { DIFFICULT_LAPSES, gradeAnswer, recordReview } from '../lib/srs'
import { ttsAvailable } from '../lib/tts'

interface QueueItem {
  word: Word
  exercise: ExerciseType
  /** A word answered wrong is asked again later in the session, but graded only once. */
  retry: boolean
}

type Mode = 'review' | 'practice'

/**
 * "Watering" session. Mostly typed recall, which is the strongest memory signal,
 * with some multiple-choice and listening for variety.
 */
function pickExercise(mode: Mode, audio: boolean, choices: boolean): ExerciseType {
  if (mode === 'practice' || !choices) return 'typing'
  const r = Math.random()
  if (r < 0.65) return 'typing'
  if (audio && r < 0.8) return 'audio-choice'
  return 'choice-source'
}

export default function Review({ deck, mode }: { deck: Deck; mode: Mode }) {
  const [queue, setQueue] = useState<QueueItem[] | null>(null)
  const [pos, setPos] = useState(0)
  const [pool, setPool] = useState<Word[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [score, setScore] = useState({ right: 0, wrong: 0 })
  const total = useRef(0)

  useEffect(() => {
    ;(async () => {
      const s = await getSettings()
      const words = await db.words.where('deckId').equals(deck.id).toArray()
      const byId = new Map(words.map((w) => [w.id, w]))
      let progress = await db.progress.where('deckId').equals(deck.id).toArray()
      if (mode === 'review') {
        progress = progress.filter((p) => p.due <= Date.now()).sort((a, b) => a.due - b.due)
      } else {
        // Most-missed words first; if nothing is "difficult" yet, use the weakest memories.
        const hard = progress.filter((p) => p.lapses >= DIFFICULT_LAPSES)
        progress = (hard.length ? hard : progress).sort((a, b) => b.lapses - a.lapses || a.card.stability - b.card.stability)
      }
      const audio = ttsAvailable(deck.targetLang)
      const items = progress
        .slice(0, mode === 'review' ? s.reviewsPerSession : 15)
        .map((p) => byId.get(p.wordId))
        .filter((w): w is Word => !!w)
        .map((word) => ({ word, exercise: pickExercise(mode, audio, words.length >= 3), retry: false }))
      total.current = items.length
      setPool(words)
      setSettings(s)
      setQueue(items)
    })()
  }, [deck, mode])

  async function onDone(outcome: ExerciseOutcome) {
    if (!queue) return
    const item = queue[pos]
    await db.reviews.add({
      wordId: item.word.id, deckId: deck.id, mode, exercise: item.exercise,
      correct: outcome.correct, responseMs: Math.round(outcome.responseMs), at: Date.now(),
    })
    if (!item.retry) {
      if (mode === 'review') await recordReview(item.word.id, gradeAnswer({ ...outcome, exercise: item.exercise }))
      setScore((s) => (outcome.correct ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }))
    }
    if (!outcome.correct) {
      // Ask again a few items later, always as typed recall.
      const next = [...queue]
      next.splice(Math.min(next.length, pos + 4), 0, { word: item.word, exercise: 'typing', retry: true })
      setQueue(next)
    }
    setPos((p) => p + 1)
  }

  if (!queue || !settings) return null

  if (queue.length === 0)
    return (
      <div className="page center-page">
        <div className="celebrate">💧</div>
        <p>{mode === 'review' ? 'אין מילים לחזרה כרגע. כל הכבוד!' : 'אין עדיין מילים שנלמדו.'}</p>
        <Link className="btn" to="/">לדף הבית</Link>
      </div>
    )

  if (pos >= queue.length) {
    const pct = Math.round((score.right / Math.max(1, score.right + score.wrong)) * 100)
    return (
      <div className="page center-page">
        <div className="celebrate">{pct >= 80 ? '🌳' : '🌿'}</div>
        <h1>{mode === 'review' ? 'החזרה הושלמה!' : 'התרגול הושלם!'}</h1>
        <p>
          {score.right} נכונות מתוך {score.right + score.wrong} ({pct}%)
        </p>
        <Link className="btn" to="/">לדף הבית</Link>
      </div>
    )
  }

  const item = queue[pos]
  const done = queue.slice(0, pos).filter((q) => !q.retry).length
  return (
    <div className="page session">
      <div className="session-top">
        <Link to="/" className="close" aria-label="יציאה">✕</Link>
        <ProgressBar value={done / total.current} />
        <span className="muted counter">{done}/{total.current}</span>
      </div>
      <Exercise
        key={pos}
        word={item.word}
        exercise={item.exercise}
        deck={deck}
        pool={pool}
        autoPlay={settings.autoPlayAudio}
        onDone={onDone}
      />
    </div>
  )
}
