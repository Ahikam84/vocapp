import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Exercise, { type ExerciseOutcome } from '../components/Exercise'
import { KnownButton, ProgressBar, T, UndoToast } from '../components/common'
import { db, newId, setKnown, type Deck, type Word } from '../lib/db'
import { LearnSession, type Step } from '../lib/session'
import { getSettings, type Settings } from '../lib/settings'
import { markLearned } from '../lib/srs'
import { ttsAvailable } from '../lib/tts'
import { startOfToday } from '../lib/stats'

interface Loaded {
  session: LearnSession
  pool: Word[]
  settings: Settings
}

export default function Learn({ deck }: { deck: Deck }) {
  const [round, setRound] = useState(0)
  return <LearnRound key={round} deck={deck} onAgain={() => setRound((r) => r + 1)} />
}

function LearnRound({ deck, onAgain }: { deck: Deck; onAgain: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [step, setStep] = useState<Step | null>(null)
  const [stepNo, setStepNo] = useState(0)
  const [learned, setLearned] = useState<Word[]>([])
  const [reason, setReason] = useState<string | null>(null)
  const [knownWord, setKnownWord] = useState<Word | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      const settings = await getSettings()
      const [pool, progress] = await Promise.all([
        db.words.where('deckId').equals(deck.id).sortBy('createdAt'),
        db.progress.where('deckId').equals(deck.id).toArray(),
      ])
      const learnedIds = new Set(progress.map((p) => p.wordId))
      const learnedToday = progress.filter((p) => p.learnedAt >= startOfToday()).length
      const quota = Math.min(settings.wordsPerSession, settings.newPerDay - learnedToday)
      const fresh = pool.filter((w) => !learnedIds.has(w.id) && !w.known).slice(0, Math.max(0, quota))

      if (fresh.length === 0) {
        setReason(quota <= 0 ? 'הגעת ליעד המילים החדשות להיום 🎉 אפשר לשנות אותו בהגדרות.' : 'אין מילים חדשות ללמוד. הוסף מילים כדי להמשיך.')
        return
      }
      const session = new LearnSession(fresh, { audio: ttsAvailable(deck.targetLang), choices: pool.length >= 3 })
      setLoaded({ session, pool, settings })
      setStep(session.next())
    })()
  }, [deck])

  async function onDone(outcome: ExerciseOutcome) {
    if (!loaded || !step) return
    const { session } = loaded
    if (step.exercise !== 'intro')
      await db.reviews.add({
        id: newId(), wordId: step.item.word.id, deckId: deck.id, mode: 'learn', exercise: step.exercise,
        correct: outcome.correct, responseMs: Math.round(outcome.responseMs), at: Date.now(),
      })
    if (session.answer(step.item, outcome.correct)) {
      await markLearned(step.item.word.id, deck.id)
      setLearned((l) => [...l, step.item.word])
    }
    setStep(session.next())
    setStepNo((n) => n + 1)
  }

  async function markKnown() {
    if (!loaded || !step) return
    const word = step.item.word
    await setKnown(word.id, true)
    loaded.session.remove(word.id)
    setKnownWord(word)
    setStep(loaded.session.next())
    setStepNo((n) => n + 1)
  }

  const undoToast = knownWord && (
    <UndoToast
      key={knownWord.id}
      message={<>"<T>{knownWord.term}</T>" סומנה כמוכרת ולא תופיע יותר</>}
      onUndo={() => setKnown(knownWord.id, false)}
      onClose={() => setKnownWord(null)}
    />
  )

  if (reason)
    return (
      <div className="page center-page">
        <p>{reason}</p>
        <div className="row center">
          <Link className="btn" to="/words/new">הוספת מילים</Link>
          <Link className="btn secondary" to="/">חזרה</Link>
        </div>
      </div>
    )
  if (!loaded) return null

  if (!step)
    return (
      <div className="page center-page">
        <div className="celebrate">🌱</div>
        <h1>{learned.length ? `נשתלו ${learned.length} מילים חדשות!` : 'הסשן הסתיים'}</h1>
        <ul className="summary">
          {learned.map((w) => (
            <li key={w.id}><T>{w.term}</T> = {w.translations[0]}</li>
          ))}
        </ul>
        <p className="muted">הן יחזרו לחזרה בימים הקרובים, במרווחים שהולכים וגדלים.</p>
        <div className="row center">
          <button className="btn" onClick={onAgain}>עוד מילים</button>
          <Link className="btn secondary" to="/">לדף הבית</Link>
        </div>
        {undoToast}
      </div>
    )

  return (
    <div className="page session">
      <div className="session-top">
        <Link to="/" className="close" aria-label="יציאה">✕</Link>
        <ProgressBar value={loaded.session.progress} />
        <KnownButton onClick={markKnown} />
      </div>
      <Exercise
        key={stepNo}
        word={step.item.word}
        exercise={step.exercise}
        deck={deck}
        pool={loaded.pool}
        autoPlay={loaded.settings.autoPlayAudio}
        onDone={onDone}
      />
      {undoToast}
    </div>
  )
}
