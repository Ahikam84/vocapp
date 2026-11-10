import { Snail, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ProgressBar, T, Term } from '../components/common'
import type { Word } from '../lib/db'
import { listenOptions, loadGameWords, logGameAnswer, MIN_GAME_WORDS, recordScore, shuffled } from '../lib/games'
import { dirOf, t } from '../lib/i18n'
import { speak, ttsAvailable } from '../lib/tts'
import type { Study } from '../lib/useDeck'
import { GameOver } from './GameOver'
import { NotEnough } from './Pairs'

const QUESTIONS = 10

/** Listening: hear a word (without seeing it) and pick what it means. */
export default function Listen({ study }: { study: Study }) {
  const [pool, setPool] = useState<Word[] | null>(null)
  const [round, setRound] = useState(0)
  // Keyed on the course ids, not `study` itself: that object is renewed on every database
  // change (sync bookkeeping after each answer), which would reload and reshuffle mid-game.
  const deckKey = study.deckIds.join()
  useEffect(() => {
    loadGameWords(deckKey.split(',')).then(setPool)
  }, [deckKey])
  const lang = study.deck.targetLang
  if (!pool) return null
  if (pool.length < MIN_GAME_WORDS) return <NotEnough count={pool.length} />
  if (!ttsAvailable(lang))
    return (
      <div className="page center-page">
        <p>{t('במכשיר הזה אין קול להקראה בשפת הקורס, ולכן אי אפשר לשחק במשחק ההאזנה.')}</p>
      </div>
    )
  return <ListenRound key={round} pool={pool} lang={lang} onAgain={() => setRound((r) => r + 1)} />
}

function ListenRound({ pool, lang, onAgain }: { pool: Word[]; lang: string; onAgain: () => void }) {
  // Fixed for the whole round
  const [questions] = useState(() => shuffled(pool).slice(0, QUESTIONS))
  const [started, setStarted] = useState(false)
  const [n, setN] = useState(0)
  const [chosen, setChosen] = useState<Word | null>(null)
  const [score, setScore] = useState(0)
  const scoreRef = useRef(0)
  const [over, setOver] = useState<{ prevBest: number } | null>(null)
  const startedAt = useRef(Date.now())
  const askedAt = useRef(Date.now())
  const word = questions[n]
  const options = useMemo(() => listenOptions(word, pool), [n]) // eslint-disable-line react-hooks/exhaustive-deps

  // Each new word is heard as soon as it's asked. Browsers only allow sound after a tap,
  // which is why the round opens with a start button.
  useEffect(() => {
    if (started) speak(word.term, lang)
  }, [started, n]) // eslint-disable-line react-hooks/exhaustive-deps

  function next() {
    if (n + 1 >= questions.length) {
      recordScore('listen', scoreRef.current).then((prevBest) => setOver({ prevBest }))
      return
    }
    setN(n + 1)
    setChosen(null)
    askedAt.current = Date.now()
  }

  function choose(w: Word) {
    if (chosen) return
    const ok = w.id === word.id
    setChosen(w)
    logGameAnswer('listen', word, ok, Date.now() - askedAt.current)
    if (ok) {
      scoreRef.current++
      setScore(scoreRef.current)
      setTimeout(next, 1300)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started) return
      const i = Number(e.key) - 1
      if (i >= 0 && i < options.length) choose(options[i])
      else if (e.key === ' ' && !chosen) {
        e.preventDefault()
        speak(word.term, lang)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (over)
    return <GameOver game="listen" title={t('{score} מתוך {total}', { score, total: questions.length })} score={score} prevBest={over.prevBest} since={startedAt.current} onAgain={onAgain} />

  if (!started)
    return (
      <div className="page center-page game listen">
        <p>{t('תשמעו מילה, בלי לראות אותה כתובה. בחרו מה היא אומרת.')}</p>
        <button
          className="btn big"
          autoFocus
          onClick={() => {
            startedAt.current = askedAt.current = Date.now()
            setStarted(true)
          }}
        >
          <Volume2 size={20} /> {t('מתחילים')}
        </button>
      </div>
    )

  const ok = chosen?.id === word.id
  return (
    <div className="page game listen">
      <div className="game-bar">
        <ProgressBar value={n / questions.length} />
        <span className="game-points"><bdi>{n + 1} / {questions.length}</bdi></span>
      </div>
      <p className="prompt-label">{t('מה שמעת?')}</p>
      <div className="listen-play">
        <button className="play-big" onClick={() => speak(word.term, lang)} aria-label={t('השמע שוב')}><Volume2 size={40} /></button>
        <button className="btn secondary small" onClick={() => speak(word.term, lang, 0.55)} aria-label={t('לאט')}><Snail size={18} /> {t('לאט')}</button>
      </div>
      <div className={`listen-word ${chosen ? (ok ? 'ok' : 'bad') : ''}`} dir={dirOf(lang)}>
        {chosen ? <Term word={word} /> : '?'}
      </div>
      <div className="options">
        {options.map((o, i) => {
          const state = !chosen ? '' : o.id === word.id ? 'right' : o.id === chosen.id ? 'wrong' : 'dim'
          return (
            <button key={o.id} className={`option ${state}`} onClick={() => choose(o)}>
              <span className="key">{i + 1}</span>
              <span className="grow"><T>{o.translations[0]}</T></span>
              {chosen && o.id !== word.id && <small className="muted" dir={dirOf(lang)}><Term word={o} /></small>}
            </button>
          )
        })}
      </div>
      {chosen && !ok && <button className="btn" autoFocus onClick={next}>{t('המשך')}</button>}
    </div>
  )
}
