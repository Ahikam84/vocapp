import { Timer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { T } from '../components/common'
import { normalize } from '../lib/answer'
import type { Word } from '../lib/db'
import { loadGameWords, logGameAnswer, MIN_GAME_WORDS, recordScore, shuffled } from '../lib/games'
import { t } from '../lib/i18n'
import { getSettings } from '../lib/settings'
import { speak } from '../lib/tts'
import type { Study } from '../lib/useDeck'
import { GameOver } from './GameOver'

const ROWS = 5
const SECONDS = 60

type Side = 'term' | 'meaning'
interface Flash {
  term: number
  meaning: number
  ok: boolean
}

/**
 * Pairs against the clock: words on one side, translations on the other.
 * Tap a word and its translation; each match is replaced by a new pair.
 */
export default function Pairs({ study }: { study: Study }) {
  const [pool, setPool] = useState<Word[] | null>(null)
  const [round, setRound] = useState(0)
  useEffect(() => {
    loadGameWords(study.deckIds).then(setPool)
  }, [study])
  if (!pool) return null
  if (pool.length < MIN_GAME_WORDS) return <NotEnough count={pool.length} />
  return <PairsRound key={round} pool={pool} lang={study.deck.targetLang} onAgain={() => setRound((r) => r + 1)} />
}

/** Not enough learned words (or, for some games, words of the right kind) to play. */
export function NotEnough({ count, need = MIN_GAME_WORDS, sentences }: { count: number; need?: number; sentences?: boolean }) {
  return (
    <div className="page center-page">
      <p>
        {sentences
          ? t('למשחק הזה צריך לפחות {n} מילים שלמדת עם משפט לדוגמה. כרגע יש {count}.', { n: need, count })
          : t('כדי לשחק צריך לפחות {n} מילים שכבר למדת. כרגע יש {count}.', { n: need, count })}
      </p>
      <Link className="btn" to="/learn">{t('למידת מילים חדשות')}</Link>
    </div>
  )
}

function PairsRound({ pool, lang, onAgain }: { pool: Word[]; lang: string; onAgain: () => void }) {
  const queue = useRef<Word[]>([])
  const draw = (onBoard: Word[]): Word => {
    // Never two words with the same spelling or the same translation on the board at once
    const terms = new Set(onBoard.map((w) => normalize(w.term)))
    const meanings = new Set(onBoard.map((w) => normalize(w.translations[0])))
    for (let tries = 0; tries < pool.length * 2; tries++) {
      if (!queue.current.length) queue.current = shuffled(pool)
      const w = queue.current.shift()!
      if (!terms.has(normalize(w.term)) && !meanings.has(normalize(w.translations[0]))) return w
      queue.current.push(w)
    }
    return queue.current.shift()!
  }

  const [board, setBoard] = useState(() => {
    const words: Word[] = []
    for (let i = 0; i < ROWS; i++) words.push(draw(words))
    return { terms: shuffled(words), meanings: shuffled(words) }
  })
  const [picked, setPickedState] = useState<{ side: Side; i: number } | null>(null)
  // Mirrors `picked` at once, so two quick taps never read a stale selection
  const pickedRef = useRef<{ side: Side; i: number } | null>(null)
  const setPicked = (p: { side: Side; i: number } | null) => {
    pickedRef.current = p
    setPickedState(p)
  }
  const busy = useRef(false)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [score, setScore] = useState(0)
  const [left, setLeft] = useState(SECONDS)
  const [started, setStarted] = useState(false)
  const [over, setOver] = useState<{ prevBest: number } | null>(null)
  const startedAt = useRef(Date.now())
  const lastHit = useRef(Date.now())
  const autoPlay = useRef(true)

  useEffect(() => {
    getSettings().then((s) => (autoPlay.current = s.autoPlayAudio))
  }, [])

  useEffect(() => {
    if (!started || over) return
    if (left <= 0) {
      recordScore('pairs', score).then((prevBest) => setOver({ prevBest }))
      return
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [started, left, over]) // eslint-disable-line react-hooks/exhaustive-deps

  function tap(side: Side, i: number) {
    if (busy.current || over) return
    if (!started) {
      setStarted(true)
      startedAt.current = lastHit.current = Date.now()
    }
    const first = pickedRef.current
    if (!first || first.side === side) return setPicked({ side, i })
    const termIdx = side === 'term' ? i : first.i
    const meaningIdx = side === 'meaning' ? i : first.i
    const word = board.terms[termIdx]
    const ok = word.id === board.meanings[meaningIdx].id
    const ms = Date.now() - lastHit.current
    logGameAnswer('pairs', word, ok, ms)
    setPicked(null)
    busy.current = true
    setFlash({ term: termIdx, meaning: meaningIdx, ok })
    if (ok) {
      lastHit.current = Date.now()
      setScore((s) => s + 1)
      if (autoPlay.current) speak(word.term, lang)
    }
    setTimeout(() => {
      busy.current = false
      setFlash(null)
      if (!ok) return
      setBoard((b) => {
        const others = b.terms.filter((_, k) => k !== termIdx)
        const next = draw(others)
        const terms = [...b.terms]
        const meanings = [...b.meanings]
        terms[termIdx] = next
        meanings[meaningIdx] = next
        // Move the new translation to a random row so the pair doesn't give itself away
        const k = Math.floor(Math.random() * ROWS)
        ;[meanings[meaningIdx], meanings[k]] = [meanings[k], meanings[meaningIdx]]
        return { terms, meanings }
      })
    }, ok ? 280 : 450)
  }

  if (over) return <GameOver game="pairs" title={t('נגמר הזמן!')} score={score} prevBest={over.prevBest} since={startedAt.current} onAgain={onAgain} />

  const cls = (side: Side, i: number) => {
    const f = flash && (side === 'term' ? flash.term : flash.meaning) === i ? (flash.ok ? 'ok' : 'bad') : ''
    const p = picked?.side === side && picked.i === i ? 'picked' : ''
    return `pair-card ${f} ${p}`
  }

  return (
    <div className="page game pairs">
      <div className="game-bar">
        <span className={`game-timer ${left <= 10 ? 'low' : ''}`}><Timer size={18} /> <bdi>{left}</bdi></span>
        <span className="game-points">{t('זוגות: {n}', { n: score })}</span>
      </div>
      {!started && <p className="muted center-text">{t('לחצו על מילה ועל התרגום שלה. השעון מתחיל בלחיצה הראשונה.')}</p>}
      <div className="pairs-board">
        <div className="pairs-col">
          {board.terms.map((w, i) => (
            <button key={`${w.id}-${i}`} className={cls('term', i)} onClick={() => tap('term', i)}>
              <T>{w.term}</T>
            </button>
          ))}
        </div>
        <div className="pairs-col">
          {board.meanings.map((w, i) => (
            <button key={`${w.id}-${i}`} className={cls('meaning', i)} onClick={() => tap('meaning', i)}>
              <T>{w.translations[0]}</T>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
