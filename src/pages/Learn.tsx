import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Exercise, { type ExerciseOutcome, type MeterInfo } from '../components/Exercise'
import { KnownButton, knownMessage, ProgressBar, SoundToggle, T, UndoToast } from '../components/common'
import { SessionReward } from '../components/Goal'
import { db, newId, setKnown, type Word } from '../lib/db'
import { t } from '../lib/i18n'
import { interleaveByDeck, LearnSession, type Step } from '../lib/session'
import { getSettings, useSettings, type Settings } from '../lib/settings'
import { markLearned } from '../lib/srs'
import { ttsAvailable } from '../lib/tts'
import { startOfToday } from '../lib/stats'
import type { Study } from '../lib/useDeck'

interface Loaded {
  session: LearnSession
  pool: Word[]
  settings: Settings
}

export default function Learn({ study }: { study: Study }) {
  const [round, setRound] = useState(0)
  return <LearnRound key={round} study={study} onAgain={() => setRound((r) => r + 1)} />
}

function LearnRound({ study, onAgain }: { study: Study; onAgain: () => void }) {
  const { deck } = study
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [step, setStep] = useState<Step | null>(null)
  const [stepNo, setStepNo] = useState(0)
  const [learned, setLearned] = useState<Word[]>([])
  const [reason, setReason] = useState<string | null>(null)
  const [knownWord, setKnownWord] = useState<Word | null>(null)
  const started = useRef(false)
  const startedAt = useRef(Date.now())
  const liveSettings = useSettings()

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      const settings = await getSettings()
      const [pool, progress] = await Promise.all([
        db.words.where('deckId').anyOf(study.deckIds).sortBy('createdAt'),
        db.progress.where('deckId').anyOf(study.deckIds).toArray(),
      ])
      const learnedIds = new Set(progress.map((p) => p.wordId))
      const learnedToday = progress.filter((p) => p.learnedAt >= startOfToday()).length
      const quota = Math.min(settings.wordsPerSession, settings.newPerDay - learnedToday)
      const fresh = interleaveByDeck(pool.filter((w) => !learnedIds.has(w.id) && !w.known), study.deckIds).slice(0, Math.max(0, quota))

      if (fresh.length === 0) {
        setReason(quota <= 0 ? t('הגעת ליעד המילים החדשות להיום. אפשר לשנות אותו בהגדרות.') : t('אין מילים חדשות ללמוד. הוסף מילים כדי להמשיך.'))
        return
      }
      const session = new LearnSession(fresh, { audio: ttsAvailable(deck.targetLang), choices: pool.length >= 3 })
      setLoaded({ session, pool, settings })
      setStep(session.next())
    })()
  }, [study]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onDone(outcome: ExerciseOutcome) {
    if (!loaded || !step) return
    const { session } = loaded
    if (step.exercise !== 'intro')
      await db.reviews.add({
        id: newId(), wordId: step.item.word.id, deckId: step.item.word.deckId, mode: 'learn', exercise: step.exercise,
        correct: outcome.correct, almost: outcome.almost, responseMs: Math.round(outcome.responseMs), at: Date.now(),
      })
    if (session.answer(step.item, outcome.correct)) {
      await markLearned(step.item.word.id, step.item.word.deckId)
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
      message={knownMessage(knownWord.term)}
      onUndo={() => setKnown(knownWord.id, false)}
      onClose={() => setKnownWord(null)}
    />
  )

  if (reason)
    return (
      <div className="page center-page">
        <p>{reason}</p>
        <div className="row center">
          <Link className="btn" to="/words/new">{t('הוספת מילים')}</Link>
          <Link className="btn secondary" to="/">{t('חזרה')}</Link>
        </div>
      </div>
    )
  if (!loaded) return null

  if (!step)
    return (
      <div className="page center-page">
        <h1>{learned.length ? t('נשתלו {n} מילים חדשות!', { n: learned.length }) : t('הסשן הסתיים')}</h1>
        <ul className="summary">
          {learned.map((w) => (
            <li key={w.id}><T>{w.term}</T> = <T>{w.translations[0]}</T></li>
          ))}
        </ul>
        <p className="muted">{t('הן יחזרו לחזרה בימים הקרובים, במרווחים שהולכים וגדלים.')}</p>
        <SessionReward since={startedAt.current} />
        <div className="row center">
          <button className="btn" onClick={onAgain}>{t('עוד מילים')}</button>
          <Link className="btn secondary" to="/">{t('לדף הבית')}</Link>
        </div>
        {undoToast}
      </div>
    )

  const { rungs } = loaded.session
  const climbed = step.item.level
  const meter: MeterInfo = {
    level: climbed,
    max: rungs,
    label: (n) => (n >= rungs ? t('נשתלה!') : t('שלב {n} מתוך {max}', { n, max: rungs })),
    // Mirrors LearnSession.answer: up a step when right, down one (not below 1) when wrong.
    after: (o) => (o.correct ? Math.min(rungs, climbed + 1) : Math.max(1, climbed - 1)),
  }

  return (
    <div className="page session">
      <div className="session-top">
        <Link to="/" className="close" aria-label={t('יציאה')}><X size={22} /></Link>
        <ProgressBar value={loaded.session.progress} />
        <SoundToggle />
        <KnownButton onClick={markKnown} />
      </div>
      <Exercise
        key={stepNo}
        word={step.item.word}
        exercise={step.exercise}
        deck={deck}
        pool={loaded.pool}
        autoPlay={(liveSettings ?? loaded.settings).autoPlayAudio}
        onDone={onDone}
        meter={meter}
      />
      {undoToast}
    </div>
  )
}
