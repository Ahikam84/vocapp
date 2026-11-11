import { useEffect, useMemo, useRef, useState } from 'react'
import { ProgressBar, T } from '../components/common'
import type { Word } from '../lib/db'
import { clozeFor, clozeOptions, loadGameWords, logGameAnswer, recordScore, shuffled, type Cloze } from '../lib/games'
import { dirOf, t } from '../lib/i18n'
import { getSettings } from '../lib/settings'
import { speak } from '../lib/tts'
import type { Study } from '../lib/useDeck'
import { GameOver } from './GameOver'
import { NotEnough } from './Pairs'

const QUESTIONS = 10
export const MIN_CLOZE = 4

/** Complete the sentence: a learned word's example sentence with the word missing; pick it from four. */
export default function ClozeGame({ study }: { study: Study }) {
  const [pool, setPool] = useState<Word[] | null>(null)
  const [round, setRound] = useState(0)
  // Keyed on the course ids, not `study` itself: that object is renewed on every database
  // change (sync bookkeeping after each answer), which would reload and reshuffle mid-game.
  const deckKey = study.deckIds.join()
  useEffect(() => {
    loadGameWords(deckKey.split(',')).then(setPool)
  }, [deckKey])
  const items = useMemo(() => (pool ?? []).map(clozeFor).filter((c): c is Cloze => !!c), [pool])
  if (!pool) return null
  if (items.length < MIN_CLOZE) return <NotEnough count={items.length} need={MIN_CLOZE} sentences />
  return <ClozeRound key={round} items={items} pool={pool} lang={study.deck.targetLang} onAgain={() => setRound((r) => r + 1)} />
}

/** Options shaped like the blank: same article use and same capital letter. */

function ClozeRound({ items, pool, lang, onAgain }: { items: Cloze[]; pool: Word[]; lang: string; onAgain: () => void }) {
  // Fixed for the whole round
  const [questions] = useState(() => shuffled(items).slice(0, QUESTIONS))
  const [n, setN] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  // Read by the delayed move to the next question, so it must not be a stale copy
  const scoreRef = useRef(0)
  const [over, setOver] = useState<{ prevBest: number } | null>(null)
  const startedAt = useRef(Date.now())
  const askedAt = useRef(Date.now())
  const autoPlay = useRef(true)
  useEffect(() => {
    getSettings().then((s) => (autoPlay.current = s.autoPlayAudio))
  }, [])

  const item = questions[n]
  const options = useMemo(() => clozeOptions(item, pool), [n]) // eslint-disable-line react-hooks/exhaustive-deps

  function next() {
    if (n + 1 >= questions.length) {
      recordScore('cloze', scoreRef.current).then((prevBest) => setOver({ prevBest }))
      return
    }
    setN(n + 1)
    setChosen(null)
    askedAt.current = Date.now()
  }

  function choose(option: string) {
    if (chosen) return
    const ok = option === item.answer
    setChosen(option)
    logGameAnswer('cloze', item.word, ok, Date.now() - askedAt.current)
    if (ok) {
      scoreRef.current++
      setScore(scoreRef.current)
    }
    // Hearing the whole sentence after answering ties the word to its use
    if (autoPlay.current && item.word.example) speak(item.word.example, lang)
    if (ok) setTimeout(next, 1400)
  }

  if (over)
    return <GameOver game="cloze" title={t('{score} מתוך {total}', { score, total: questions.length })} score={score} prevBest={over.prevBest} since={startedAt.current} onAgain={onAgain} />

  const ok = chosen === item.answer
  return (
    <div className="page game cloze">
      <div className="game-bar">
        <ProgressBar value={n / questions.length} />
        <span className="game-points"><bdi>{n + 1} / {questions.length}</bdi></span>
      </div>
      <p className="prompt-label">{t('השלימו את המשפט')}</p>
      <div className="card cloze-sentence" dir={dirOf(lang)}>
        {item.before}
        <span className={`cloze-blank ${chosen ? (ok ? 'ok' : 'reveal') : ''}`}>{chosen ? item.answer : '   '}</span>
        {item.after}
      </div>
      {chosen && item.word.exampleReading && <p className="reading center-text" dir="auto">{item.word.exampleReading}</p>}
      {item.word.exampleTranslation && <p className="muted center-text"><T>{item.word.exampleTranslation}</T></p>}
      <div className="options">
        {options.map((o) => {
          const state = !chosen ? '' : o === item.answer ? 'right' : o === chosen ? 'wrong' : 'dim'
          return (
            <button key={o} className={`option ${state}`} onClick={() => choose(o)}>
              <T>{o}</T>
            </button>
          )
        })}
      </div>
      {chosen && !ok && (
        <button className="btn" autoFocus onClick={next}>{t('המשך')}</button>
      )}
    </div>
  )
}
