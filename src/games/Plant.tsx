import { useEffect, useMemo, useRef, useState } from 'react'
import cat from '../assets/mascot/cat.webp'
import pot3 from '../assets/mascot/pot3.webp'
import water from '../assets/mascot/water.webp'
import { T, WritingToggle } from '../components/common'
import { useWritingMode, writingLang, writtenForm } from '../lib/writing'
import type { Word } from '../lib/db'
import { alphabetFor, baseLetters, loadGameWords, logGameAnswer, MIN_GAME_WORDS, recordScore, shuffled } from '../lib/games'
import { dirOf, t } from '../lib/i18n'
import { getSettings } from '../lib/settings'
import { speak } from '../lib/tts'
import { toHebrewKeys, type Study } from '../lib/useDeck'
import { GameOver } from './GameOver'
import { NotEnough } from './Pairs'

const MAX_WRONG = 6
const isLetter = (c: string) => /\p{L}/u.test(c)

/**
 * Save the plant: guess the word letter by letter from its translation.
 * Every wrong letter wilts the plant; six and it's gone. Each word saved scores a point.
 */
export default function Plant({ study }: { study: Study }) {
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
  return <PlantRound key={round} pool={pool} lang={study.deck.targetLang} onAgain={() => setRound((r) => r + 1)} />
}

function PlantRound({ pool, lang, onAgain }: { pool: Word[]; lang: string; onAgain: () => void }) {
  const [order] = useState(() => shuffled(pool))
  // In transliteration mode the word to guess is its transliteration, on a keyboard of its letters.
  const writing = useWritingMode(lang)
  const hasReadings = pool.some((w) => w.reading)
  const [idx, setIdx] = useState(0)
  const [guessed, setGuessed] = useState<string[]>([])
  const [wrong, setWrong] = useState(0)
  const [state, setState] = useState<'play' | 'won' | 'lost'>('play')
  const [score, setScore] = useState(0)
  const [over, setOver] = useState<{ prevBest: number } | null>(null)
  const startedAt = useRef(Date.now())
  const wordStart = useRef(Date.now())
  const autoPlay = useRef(true)
  useEffect(() => {
    getSettings().then((s) => (autoPlay.current = s.autoPlayAudio))
  }, [])

  const word = order[idx % order.length]
  const written = writtenForm(word, writing)
  const keyLang = writingLang(word, writing, lang)
  const alphabet = useMemo(() => alphabetFor(keyLang, pool), [keyLang, pool])
  const letters = useMemo(() => new Set([...baseLetters(written)].filter(isLetter)), [written])
  // Switching between script and transliteration starts the word again.
  useEffect(() => setGuessed([]), [written])

  function guess(raw: string) {
    if (state !== 'play') return
    const c = baseLetters(keyLang === 'he' ? toHebrewKeys(raw) : raw)
    if (!isLetter(c) || guessed.includes(c)) return
    const nowGuessed = [...guessed, c]
    setGuessed(nowGuessed)
    if (!letters.has(c)) {
      const w = wrong + 1
      setWrong(w)
      if (w >= MAX_WRONG) {
        setState('lost')
        logGameAnswer('plant', word, false, Date.now() - wordStart.current)
      }
      return
    }
    if ([...letters].every((l) => nowGuessed.includes(l))) {
      setState('won')
      setScore((s) => s + 1)
      logGameAnswer('plant', word, true, Date.now() - wordStart.current)
      if (autoPlay.current) speak(word.term, lang)
      setTimeout(() => {
        // Next word: the plant recovers a little (two mistakes) as a reward
        setIdx((i) => i + 1)
        setGuessed([])
        setWrong((x) => Math.max(0, x - 2))
        setState('play')
        wordStart.current = Date.now()
      }, 1500)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || [...e.key].length !== 1) return
      guess(e.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function finish() {
    setOver({ prevBest: await recordScore('plant', score) })
  }

  if (over) return <GameOver game="plant" title={t('הצמח נבל')} score={score} prevBest={over.prevBest} since={startedAt.current} onAgain={onAgain} />

  const wilt = wrong / MAX_WRONG
  return (
    <div className="page game plant-game">
      <div className="game-bar">
        <span className="game-points">{t('מילים שניצלו: {n}', { n: score })}</span>
        <span className="plant-health" aria-label={t('{n} טעויות מתוך {max}', { n: wrong, max: MAX_WRONG })}>
          {Array.from({ length: MAX_WRONG }, (_, i) => <i key={i} className={i < MAX_WRONG - wrong ? 'on' : ''} />)}
        </span>
      </div>

      <div className="plant-scene" aria-hidden="true">
        {state === 'won' ? (
          <img src={water} alt="" className="plant-water" />
        ) : (
          <>
            <img src={cat} alt="" className="plant-cat" />
            <img
              src={pot3}
              alt=""
              className="plant-pot"
              style={{
                filter: `saturate(${1 - 0.9 * wilt}) brightness(${1 - 0.25 * wilt})`,
                transform: `rotate(${-14 * wilt}deg) scale(${1 - 0.18 * wilt})`,
              }}
            />
          </>
        )}
      </div>

      {hasReadings && state === 'play' && <WritingToggle lang={lang} mode={writing} />}
      <p className="plant-clue"><T>{word.translations.join(', ')}</T></p>
      <div className={`plant-word ${state}`} dir={dirOf(keyLang)}>
        {[...written].map((ch, i) =>
          !isLetter(ch) ? (
            <span key={i} className="gap">{ch === ' ' ? ' ' : ch}</span>
          ) : (
            <span key={i} className={`slot ${guessed.includes(baseLetters(ch)) ? 'shown' : state === 'lost' ? 'missed' : ''}`}>
              {guessed.includes(baseLetters(ch)) || state !== 'play' ? ch : ' '}
            </span>
          ),
        )}
      </div>

      {state === 'lost' ? (
        <div className="row center">
          <button className="btn" autoFocus onClick={finish}>{t('המשך')}</button>
        </div>
      ) : (
        <div className="plant-keys" dir={dirOf(keyLang)}>
          {alphabet.map((c) => {
            const used = guessed.includes(c)
            return (
              <button key={c} className={used ? (letters.has(c) ? 'hit' : 'miss') : ''} disabled={used || state !== 'play'} onClick={() => guess(c)}>
                {c}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
