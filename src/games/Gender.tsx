import { Timer } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { T } from '../components/common'
import type { Word } from '../lib/db'
import { genderOf, loadGameWords, logGameAnswer, recordScore, shuffled } from '../lib/games'
import { t } from '../lib/i18n'
import type { Study } from '../lib/useDeck'
import { GameOver } from './GameOver'
import { NotEnough } from './Pairs'

const SECONDS = 60
export const MIN_GENDER = 6

/** el or la? A Spanish noun without its article: pick the right one, as many as you can in a minute. */
export default function Gender({ study }: { study: Study }) {
  const [pool, setPool] = useState<Word[] | null>(null)
  const [round, setRound] = useState(0)
  // Keyed on the course ids, not `study` itself: that object is renewed on every database
  // change (sync bookkeeping after each answer), which would reload and reshuffle mid-game.
  const deckKey = study.deckIds.join()
  useEffect(() => {
    loadGameWords(deckKey.split(',')).then(setPool)
  }, [deckKey])
  const nouns = useMemo(() => (pool ?? []).filter((w) => genderOf(w)), [pool])
  if (!pool) return null
  if (nouns.length < MIN_GENDER) return <NotEnough count={nouns.length} need={MIN_GENDER} />
  return <GenderRound key={round} nouns={nouns} onAgain={() => setRound((r) => r + 1)} />
}

function GenderRound({ nouns, onAgain }: { nouns: Word[]; onAgain: () => void }) {
  const queue = useRef<Word[]>([])
  const draw = (prev?: Word) => {
    if (!queue.current.length) queue.current = shuffled(nouns)
    let w = queue.current.shift()!
    if (w.id === prev?.id && nouns.length > 1) {
      queue.current.push(w)
      w = queue.current.shift()!
    }
    return w
  }
  const [word, setWord] = useState(() => draw())
  const [feedback, setFeedback] = useState<{ ok: boolean; article: string } | null>(null)
  const [score, setScore] = useState(0)
  const [left, setLeft] = useState(SECONDS)
  const [started, setStarted] = useState(false)
  const [over, setOver] = useState<{ prevBest: number } | null>(null)
  const startedAt = useRef(Date.now())
  const shownAt = useRef(Date.now())
  const busy = useRef(false)
  const g = genderOf(word)!

  useEffect(() => {
    if (!started || over) return
    if (left <= 0) {
      recordScore('gender', score).then((prevBest) => setOver({ prevBest }))
      return
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [started, left, over]) // eslint-disable-line react-hooks/exhaustive-deps

  function answer(article: 'el' | 'la') {
    if (busy.current || over || left <= 0) return
    if (!started) {
      setStarted(true)
      startedAt.current = Date.now()
    }
    const ok = article === g.article
    busy.current = true
    logGameAnswer('gender', word, ok, Date.now() - shownAt.current)
    if (ok) setScore((s) => s + 1)
    setFeedback({ ok, article: g.article })
    setTimeout(() => {
      busy.current = false
      setFeedback(null)
      setWord((w) => draw(w))
      shownAt.current = Date.now()
    }, ok ? 350 : 1100) // a mistake stays up a moment longer, to be seen
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'e' || k === '1') answer('el')
      else if (k === 'l' || k === '2') answer('la')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (over) return <GameOver game="gender" title={t('נגמר הזמן!')} score={score} prevBest={over.prevBest} since={startedAt.current} onAgain={onAgain} />

  return (
    <div className="page game gender">
      <div className="game-bar">
        <span className={`game-timer ${left <= 10 ? 'low' : ''}`}><Timer size={18} /> <bdi>{left}</bdi></span>
        <span className="game-points">{t('נכונות: {n}', { n: score })}</span>
      </div>
      {!started && <p className="muted center-text">{t('בחרו el או la לכל מילה. השעון מתחיל בתשובה הראשונה.')}</p>}
      <div className={`card gender-card ${feedback ? (feedback.ok ? 'ok' : 'bad') : ''}`} dir="ltr" lang="es">
        <span className="gender-article">{feedback ? feedback.article : '__'}</span> <span className="gender-noun">{g.noun}</span>
        <div className="muted gender-meaning" dir="auto"><T>{word.translations[0]}</T></div>
      </div>
      <div className="gender-buttons" dir="ltr">
        <button className="btn big el" onClick={() => answer('el')}>el</button>
        <button className="btn big la" onClick={() => answer('la')}>la</button>
      </div>
    </div>
  )
}
