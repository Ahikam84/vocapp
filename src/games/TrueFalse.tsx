import { Check, Timer, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { T, Term } from '../components/common'
import type { Word } from '../lib/db'
import { loadGameWords, logGameAnswer, MIN_GAME_WORDS, recordScore, shuffled, trueFalseFor, type TrueFalse as Question } from '../lib/games'
import { dirOf, t } from '../lib/i18n'
import type { Study } from '../lib/useDeck'
import { GameOver } from './GameOver'
import { NotEnough } from './Pairs'

const SECONDS = 60

/** True or false: is this the word's translation? As many as you can in a minute. */
export default function TrueFalse({ study }: { study: Study }) {
  const [pool, setPool] = useState<Word[] | null>(null)
  const [round, setRound] = useState(0)
  // Keyed on the course ids, not `study` itself: that object is renewed on every database
  // change (sync bookkeeping after each answer), which would reload and reshuffle mid-game.
  const deckKey = study.deckIds.join()
  useEffect(() => {
    loadGameWords(deckKey.split(',')).then(setPool)
  }, [deckKey])
  if (!pool) return null
  if (pool.length < MIN_GAME_WORDS) return <NotEnough count={pool.length} />
  return <TrueFalseRound key={round} pool={pool} lang={study.deck.targetLang} onAgain={() => setRound((r) => r + 1)} />
}

function TrueFalseRound({ pool, lang, onAgain }: { pool: Word[]; lang: string; onAgain: () => void }) {
  const queue = useRef<Word[]>([])
  const draw = (prev?: Word): Question => {
    if (!queue.current.length) queue.current = shuffled(pool)
    let w = queue.current.shift()!
    if (w.id === prev?.id && pool.length > 1) {
      queue.current.push(w)
      w = queue.current.shift()!
    }
    return trueFalseFor(w, pool)
  }
  const [q, setQ] = useState(() => draw())
  const [feedback, setFeedback] = useState<boolean | null>(null)
  const [score, setScore] = useState(0)
  const [left, setLeft] = useState(SECONDS)
  const [started, setStarted] = useState(false)
  const [over, setOver] = useState<{ prevBest: number } | null>(null)
  const startedAt = useRef(Date.now())
  const shownAt = useRef(Date.now())
  const busy = useRef(false)

  useEffect(() => {
    if (!started || over) return
    if (left <= 0) {
      recordScore('truefalse', score).then((prevBest) => setOver({ prevBest }))
      return
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [started, left, over]) // eslint-disable-line react-hooks/exhaustive-deps

  function answer(says: boolean) {
    if (busy.current || over || left <= 0) return
    if (!started) {
      setStarted(true)
      startedAt.current = Date.now()
    }
    const ok = says === q.truth
    busy.current = true
    logGameAnswer('truefalse', q.word, ok, Date.now() - shownAt.current)
    if (ok) setScore((s) => s + 1)
    setFeedback(ok)
    setTimeout(() => {
      busy.current = false
      setFeedback(null)
      setQ((prev) => draw(prev.word))
      shownAt.current = Date.now()
    }, ok ? 300 : 1400) // a mistake stays up longer, with the right translation, to be learned
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === '1' || k === 'v' || k === 'y') answer(true)
      else if (k === '2' || k === 'x' || k === 'n') answer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (over) return <GameOver game="truefalse" title={t('נגמר הזמן!')} score={score} prevBest={over.prevBest} since={startedAt.current} onAgain={onAgain} />

  return (
    <div className="page game truefalse">
      <div className="game-bar">
        <span className={`game-timer ${left <= 10 ? 'low' : ''}`}><Timer size={18} /> <bdi>{left}</bdi></span>
        <span className="game-points">{t('נכונות: {n}', { n: score })}</span>
      </div>
      {!started && <p className="muted center-text">{t('האם זה התרגום של המילה? השעון מתחיל בתשובה הראשונה.')}</p>}
      <div className={`card tf-card ${feedback === null ? '' : feedback ? 'ok' : 'bad'}`}>
        <div className="tf-term" dir={dirOf(lang)}><Term word={q.word} /></div>
        <div className="tf-eq">=</div>
        <div className={`tf-shown ${feedback === false && !q.truth ? 'struck' : ''}`}><T>{q.shown}</T></div>
        {feedback === false && !q.truth && <div className="tf-right"><T>{q.word.translations[0]}</T></div>}
      </div>
      <div className="tf-buttons">
        <button className="btn big yes" onClick={() => answer(true)}><Check size={22} /> {t('נכון')}</button>
        <button className="btn big no" onClick={() => answer(false)}><X size={22} /> {t('לא נכון')}</button>
      </div>
    </div>
  )
}
