import { Heart } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { T } from '../components/common'
import { checkAnswer } from '../lib/answer'
import type { Word } from '../lib/db'
import { loadGameWords, logGameAnswer, MIN_GAME_WORDS, recordScore, shuffled } from '../lib/games'
import { dirOf, t } from '../lib/i18n'
import { toHebrewKeys, type Study } from '../lib/useDeck'
import { GameOver } from './GameOver'
import { NotEnough } from './Pairs'

const LIVES = 3
const MAX_ON_SCREEN = 5

interface Drop {
  key: number
  word: Word
  /** Horizontal position, % of the field */
  x: number
  /** Seconds to reach the bottom */
  fall: number
  born: number
}

/**
 * Speed rises with the score: words appear more often and fall faster.
 * It starts slow (16 s to fall, a new word every 4.5 s) and reaches top speed around 40 points.
 */
export function pace(score: number) {
  return { gapMs: Math.max(1300, 4500 - score * 80), fallSec: Math.max(5, 16 - score * 0.27) }
}

/** Falling words: translations drop from the top; type the word before it lands. */
export default function Falling({ study }: { study: Study }) {
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
  return <FallingRound key={round} pool={pool} lang={study.deck.targetLang} onAgain={() => setRound((r) => r + 1)} />
}

function FallingRound({ pool, lang, onAgain }: { pool: Word[]; lang: string; onAgain: () => void }) {
  const [drops, setDrops] = useState<Drop[]>([])
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(LIVES)
  const [value, setValue] = useState('')
  const [started, setStarted] = useState(false)
  const [missed, setMissed] = useState<Word | null>(null)
  const [shake, setShake] = useState(0)
  const [over, setOver] = useState<{ prevBest: number } | null>(null)
  const queue = useRef<Word[]>([])
  const nextKey = useRef(0)
  const startedAt = useRef(Date.now())
  const dropsRef = useRef<Drop[]>([])
  dropsRef.current = drops
  const scoreRef = useRef(0)
  scoreRef.current = score
  const input = useRef<HTMLInputElement>(null)

  // Spawn words, a little faster as the score goes up
  useEffect(() => {
    if (!started || over) return
    let timer: ReturnType<typeof setTimeout>
    const spawn = () => {
      const { gapMs, fallSec } = pace(scoreRef.current)
      if (dropsRef.current.length < MAX_ON_SCREEN) {
        const onScreen = new Set(dropsRef.current.map((d) => d.word.id))
        if (!queue.current.length) queue.current = shuffled(pool)
        let word = queue.current.shift()!
        for (let i = 0; i < pool.length && onScreen.has(word.id); i++) {
          queue.current.push(word)
          word = queue.current.shift()!
        }
        setDrops((d) => [...d, { key: nextKey.current++, word, x: 4 + Math.random() * 62, fall: fallSec, born: Date.now() }])
      }
      timer = setTimeout(spawn, gapMs)
    }
    spawn()
    return () => clearTimeout(timer)
  }, [started, over]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the answer field once it's enabled (and again after a shake re-creates it)
  useEffect(() => {
    if (started) input.current?.focus()
  }, [started, shake])

  useEffect(() => {
    if (started && lives <= 0 && !over) {
      setDrops([])
      recordScore('falling', score).then((prevBest) => setOver({ prevBest }))
    }
  }, [lives]) // eslint-disable-line react-hooks/exhaustive-deps

  function landed(drop: Drop) {
    if (!dropsRef.current.some((d) => d.key === drop.key)) return
    setDrops((d) => d.filter((x) => x.key !== drop.key))
    setLives((l) => l - 1)
    setMissed(drop.word) // show the answer, so a miss still teaches
    logGameAnswer('falling', drop.word, false, Date.now() - drop.born)
  }

  function hit(drop: Drop, almost: boolean) {
    setDrops((d) => d.filter((x) => x.key !== drop.key))
    setScore((s) => s + 1)
    setValue('')
    logGameAnswer('falling', drop.word, true, Date.now() - drop.born, almost)
  }

  const accepted = (w: Word) => [w.term, ...(w.altTerms ?? [])]

  function onType(raw: string) {
    const v = lang === 'he' ? toHebrewKeys(raw) : raw
    setValue(v)
    // An exact answer counts at once – no need to press Enter
    const drop = dropsRef.current.find((d) => checkAnswer(v, accepted(d.word)).result === 'correct')
    if (drop) hit(drop, false)
  }

  function onEnter() {
    // Enter also accepts a near miss (missing accent, one typo)
    const drop = dropsRef.current.find((d) => checkAnswer(value, accepted(d.word)).result !== 'wrong')
    if (drop) hit(drop, true)
    else if (value.trim()) setShake((n) => n + 1)
  }

  if (over) return <GameOver game="falling" title={t('המשחק נגמר')} score={score} prevBest={over.prevBest} since={startedAt.current} onAgain={onAgain} />

  return (
    <div className="page game falling">
      <div className="game-bar">
        <span className="game-lives" aria-label={t('{n} חיים', { n: lives })}>
          {Array.from({ length: LIVES }, (_, i) => <Heart key={i} size={18} className={i < lives ? 'on' : ''} />)}
        </span>
        <span className="game-points">{t('ניקוד: {n}', { n: score })}</span>
      </div>
      <div className="fall-field">
        {!started && (
          <div className="fall-start">
            <p>{t('תרגומים יורדים מלמעלה. כתבו את המילה לפני שהיא נוחתת.')}</p>
            <button
              className="btn"
              onClick={() => {
                setStarted(true)
                startedAt.current = Date.now()
              }}
            >
              {t('התחלה')}
            </button>
          </div>
        )}
        {drops.map((d) => (
          <div
            key={d.key}
            className="drop"
            style={{ insetInlineStart: `${d.x}%`, animationDuration: `${d.fall}s` }}
            onAnimationEnd={() => landed(d)}
          >
            <T>{d.word.translations[0]}</T>
          </div>
        ))}
        {missed && (
          <div className="fall-missed" key={missed.id} onAnimationEnd={() => setMissed(null)}>
            <T>{missed.term}</T> = <T>{missed.translations[0]}</T>
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onEnter()
        }}
      >
        <input
          ref={input}
          key={shake}
          className={`fall-input ${shake ? 'shake' : ''}`}
          dir={dirOf(lang)}
          lang={lang}
          value={value}
          disabled={!started}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={started ? t('הקלידו כאן…') : ''}
          onChange={(e) => onType(e.target.value)}
        />
      </form>
    </div>
  )
}
