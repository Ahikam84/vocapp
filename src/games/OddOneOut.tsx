import { useEffect, useMemo, useRef, useState } from 'react'
import { ProgressBar, T } from '../components/common'
import type { Word } from '../lib/db'
import { loadGameWords, logGameAnswer, oddQuestion, recordScore, topicGroups, type OddQuestion } from '../lib/games'
import { dirOf, t } from '../lib/i18n'
import type { Study } from '../lib/useDeck'
import { GameOver } from './GameOver'

const QUESTIONS = 10

/** Odd one out needs a topic with 3+ learned words and at least one other topic. */
export function canPlayOdd(words: Word[]): boolean {
  return oddQuestion(topicGroups(words)) !== null
}

/** Odd one out: four words, three from one topic. Which one doesn't belong? */
export default function OddOneOut({ study }: { study: Study }) {
  const [pool, setPool] = useState<Word[] | null>(null)
  const [round, setRound] = useState(0)
  useEffect(() => {
    loadGameWords(study.deckIds).then(setPool)
  }, [study])
  if (!pool) return null
  if (!canPlayOdd(pool))
    return (
      <div className="page center-page">
        <p>{t('המשחק הזה משתמש בנושאים של הקורסים המוכנים. צריך לפחות 3 מילים שלמדת מנושא אחד, ועוד מילה מנושא אחר.')}</p>
      </div>
    )
  return <OddRound key={round} pool={pool} lang={study.deck.targetLang} onAgain={() => setRound((r) => r + 1)} />
}

function OddRound({ pool, lang, onAgain }: { pool: Word[]; lang: string; onAgain: () => void }) {
  const questions = useMemo(() => {
    const groups = topicGroups(pool)
    const list: OddQuestion[] = []
    // Avoid asking about the same odd word twice in one round
    for (let tries = 0; list.length < QUESTIONS && tries < QUESTIONS * 10; tries++) {
      const q = oddQuestion(groups)!
      if (!list.some((x) => x.odd.id === q.odd.id)) list.push(q)
    }
    return list
  }, [pool])
  const [n, setN] = useState(0)
  const [chosen, setChosen] = useState<Word | null>(null)
  const [score, setScore] = useState(0)
  const scoreRef = useRef(0)
  const [over, setOver] = useState<{ prevBest: number } | null>(null)
  const startedAt = useRef(Date.now())
  const askedAt = useRef(Date.now())
  const q = questions[n]

  function choose(w: Word) {
    if (chosen) return
    const ok = w.id === q.odd.id
    setChosen(w)
    logGameAnswer('odd', q.odd, ok, Date.now() - askedAt.current)
    if (ok) {
      scoreRef.current++
      setScore(scoreRef.current)
    }
  }

  function next() {
    if (n + 1 >= questions.length) {
      recordScore('odd', scoreRef.current).then((prevBest) => setOver({ prevBest }))
      return
    }
    setN(n + 1)
    setChosen(null)
    askedAt.current = Date.now()
  }

  if (over)
    return <GameOver game="odd" title={t('{score} מתוך {total}', { score, total: questions.length })} score={score} prevBest={over.prevBest} since={startedAt.current} onAgain={onAgain} />

  return (
    <div className="page game odd">
      <div className="game-bar">
        <ProgressBar value={n / questions.length} />
        <span className="game-points"><bdi>{n + 1} / {questions.length}</bdi></span>
      </div>
      <p className="prompt-label">{t('איזו מילה לא שייכת?')}</p>
      <div className="odd-grid">
        {q.words.map((w) => {
          const state = !chosen ? '' : w.id === q.odd.id ? 'right' : w.id === chosen.id ? 'wrong' : 'dim'
          return (
            <button key={w.id} className={`odd-card ${state}`} onClick={() => choose(w)} dir={dirOf(lang)}>
              <b><T>{w.term}</T></b>
              {chosen && <small><T>{w.translations[0]}</T></small>}
            </button>
          )
        })}
      </div>
      {chosen && (
        <div className={`feedback ${chosen.id === q.odd.id ? 'correct' : 'wrong'}`}>
          <div>
            {t('שלוש המילים שייכות לנושא')} <b>{q.topic}</b>,{' '}
            <T>{q.odd.term}</T> {t('שייכת לנושא')} <b>{q.oddTopic}</b>.
          </div>
          <button className="btn" autoFocus onClick={next}>{t('המשך')}</button>
        </div>
      )}
    </div>
  )
}
