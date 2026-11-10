import { useEffect, useMemo, useRef, useState } from 'react'
import { T } from '../components/common'
import { normalize } from '../lib/answer'
import type { Word } from '../lib/db'
import { loadGameWords, logGameAnswer, MIN_GAME_WORDS, recordScore, shuffled } from '../lib/games'
import { t } from '../lib/i18n'
import { getSettings } from '../lib/settings'
import { speak } from '../lib/tts'
import type { Study } from '../lib/useDeck'
import { GameOver } from './GameOver'
import { NotEnough } from './Pairs'

const PAIRS = 6

interface Card {
  key: number
  word: Word
  side: 'term' | 'meaning'
}

/** Memory: cards face down, a word and its translation make a pair. Fewer moves is better. */
export default function Memory({ study }: { study: Study }) {
  const [pool, setPool] = useState<Word[] | null>(null)
  const [round, setRound] = useState(0)
  useEffect(() => {
    loadGameWords(study.deckIds).then(setPool)
  }, [study])
  if (!pool) return null
  if (pool.length < MIN_GAME_WORDS) return <NotEnough count={pool.length} />
  return <MemoryRound key={round} pool={pool} lang={study.deck.targetLang} onAgain={() => setRound((r) => r + 1)} />
}

/** Six words that can't be confused with each other (no shared spelling or translation). */
function pickWords(pool: Word[]): Word[] {
  const chosen: Word[] = []
  const seen = new Set<string>()
  for (const w of shuffled(pool)) {
    const a = normalize(w.term)
    const b = normalize(w.translations[0])
    if (seen.has(a) || seen.has(b)) continue
    seen.add(a).add(b)
    chosen.push(w)
    if (chosen.length === PAIRS) break
  }
  return chosen
}

function MemoryRound({ pool, lang, onAgain }: { pool: Word[]; lang: string; onAgain: () => void }) {
  const cards = useMemo<Card[]>(() => {
    const words = pickWords(pool)
    return shuffled(words.flatMap((word) => [{ word, side: 'term' as const }, { word, side: 'meaning' as const }])).map((c, key) => ({ ...c, key }))
  }, [pool])
  const [open, setOpen] = useState<number[]>([])
  const [found, setFound] = useState<string[]>([])
  const [moves, setMoves] = useState(0)
  const [over, setOver] = useState<{ prevBest: number } | null>(null)
  const startedAt = useRef(Date.now())
  const firstFlip = useRef(Date.now())
  const autoPlay = useRef(true)
  useEffect(() => {
    getSettings().then((s) => (autoPlay.current = s.autoPlayAudio))
  }, [])

  const pairsTotal = cards.length / 2

  function flip(i: number) {
    if (open.length === 2 || open.includes(i) || found.includes(cards[i].word.id)) return
    if (open.length === 0) {
      firstFlip.current = Date.now()
      return setOpen([i])
    }
    const [a] = open
    setOpen([a, i])
    const m = moves + 1
    setMoves(m)
    if (cards[a].word.id === cards[i].word.id) {
      const word = cards[i].word
      // Only matches are logged: a wrong pair here is exploring, not a mistake
      logGameAnswer('memory', word, true, Date.now() - firstFlip.current)
      if (autoPlay.current) speak(word.term, lang)
      const nowFound = [...found, word.id]
      setFound(nowFound)
      setOpen([])
      if (nowFound.length === pairsTotal) setTimeout(() => recordScore('memory', m).then((prevBest) => setOver({ prevBest })), 700)
    } else {
      setTimeout(() => setOpen([]), 950)
    }
  }

  if (over)
    return (
      <GameOver
        game="memory"
        title={t('מצאת את כל הזוגות ב-{n} מהלכים', { n: moves })}
        score={moves}
        prevBest={over.prevBest}
        since={startedAt.current}
        onAgain={onAgain}
      />
    )

  return (
    <div className="page game memory">
      <div className="game-bar">
        <span className="game-points">{t('מהלכים: {n}', { n: moves })}</span>
        <span className="game-points"><bdi>{found.length} / {pairsTotal}</bdi></span>
      </div>
      <div className="memory-grid">
        {cards.map((c, i) => {
          const isFound = found.includes(c.word.id)
          const shown = isFound || open.includes(i)
          const wrong = open.length === 2 && open.includes(i) && cards[open[0]].word.id !== cards[open[1]].word.id
          return (
            <button
              key={c.key}
              className={`mem-card ${shown ? 'up' : ''} ${isFound ? 'found' : ''} ${wrong ? 'wrong' : ''}`}
              onClick={() => flip(i)}
              aria-label={shown ? (c.side === 'term' ? c.word.term : c.word.translations[0]) : t('קלף הפוך')}
            >
              <span className="mem-inner">
                <span className="mem-back" />
                <span className={`mem-front ${c.side}`}>
                  <T>{c.side === 'term' ? c.word.term : c.word.translations[0]}</T>
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
