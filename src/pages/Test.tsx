import { CircleCheck, CircleX, ClipboardCheck, Timer, TriangleAlert } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProgressBar, T, Term } from '../components/common'
import { SessionReward } from '../components/Goal'
import { TestQuestionView } from '../components/TestQuestion'
import { db, newId, type TestRef, type Word } from '../lib/db'
import { loadGameWords } from '../lib/games'
import { dirOf, t } from '../lib/i18n'
import { DIFFICULT_LAPSES } from '../lib/srs'
import {
  buildTest,
  logTestAnswer,
  markDifficult,
  MIN_TEST_POOL,
  MIN_TEST_WORDS,
  questionScore,
  TEST_LENGTHS,
  TEST_LEVELS,
  testHistory,
  testPercent,
  TYPED,
  type ItemResult,
  type TestLevel,
  type TestQuestion,
  withoutAudio,
} from '../lib/test'
import { ttsAvailable } from '../lib/tts'
import { writingModeFor } from '../lib/writing'
import type { Study } from '../lib/useDeck'

const LEVEL_NAMES: Record<TestLevel, () => string> = { easy: () => t('קל'), medium: () => t('בינוני'), hard: () => t('קשה') }
const LEVEL_HINTS: Record<TestLevel, () => string> = {
  easy: () => t('בעיקר בחירה מתוך אפשרויות'),
  medium: () => t('בחירה וגם כתיבה'),
  hard: () => t('בעיקר כתיבה והכתבה'),
}

/** Seconds per question when the test is timed */
const secondsFor = (q: TestQuestion) => (q.kind === 'match' ? 45 : TYPED.includes(q.kind) ? 40 : 20)

interface Setup {
  level: TestLevel
  length: number
  /** 'all', 'difficult' or a topic */
  source: string
  timed: boolean
}

interface Running {
  ref: Omit<TestRef, 'q'>
  questions: TestQuestion[]
  timed: boolean
}

/** A test: pick the level, length and words, answer mixed questions, get a score in percent. */
export default function Test({ study }: { study: Study }) {
  const [setup, setSetup] = useState<Setup>({ level: 'medium', length: 10, source: 'all', timed: false })
  const [running, setRunning] = useState<Running | null>(null)
  const [finished, setFinished] = useState<{ results: Answered[]; since: number; marked: number } | null>(null)
  const deckKey = study.deckIds.join()
  const lang = { target: study.deck.targetLang, source: study.deck.sourceLang }

  // Loaded once per set of courses (not on every database change), so a running test never shifts
  const [data, setData] = useState<{ pool: Word[]; difficult: Set<string> } | null>(null)
  useEffect(() => {
    const ids = deckKey.split(',')
    Promise.all([loadGameWords(ids), db.progress.where('deckId').anyOf(ids).toArray()]).then(([pool, progress]) =>
      setData({ pool, difficult: new Set(progress.filter((p) => p.lapses >= DIFFICULT_LAPSES).map((p) => p.wordId)) }),
    )
  }, [deckKey, finished])

  if (!data) return null
  if (finished)
    return (
      <Results
        results={finished.results}
        since={finished.since}
        marked={finished.marked}
        lang={lang}
        onAgain={() => {
          setFinished(null)
          setRunning(null)
        }}
      />
    )
  if (running)
    return (
      <Runner
        key={running.ref.id}
        running={running}
        lang={lang}
        onDone={async (results, since) => {
          const wrong = results.flatMap((r) => r.items.filter((i) => !i.correct).map((i) => i.word.id))
          await markDifficult(wrong)
          setFinished({ results, since, marked: new Set(wrong).size })
        }}
      />
    )
  return (
    <SetupPage
      study={study}
      pool={data.pool}
      difficult={data.difficult}
      setup={setup}
      onChange={(patch) => setSetup((s) => ({ ...s, ...patch }))}
      onStart={async (words) => {
        const audio = ttsAvailable(lang.target)
        const transliteration = (await writingModeFor(lang.target)) === 'reading'
        const questions = buildTest(words, data.pool, setup.level, setup.length, audio, transliteration)
        setRunning({ ref: { id: newId(), level: setup.level, questions: questions.length }, questions, timed: setup.timed })
      }}
    />
  )
}

// ---- Setup ------------------------------------------------------------------

function SetupPage({
  study,
  pool,
  difficult,
  setup,
  onChange,
  onStart,
}: {
  study: Study
  pool: Word[]
  difficult: Set<string>
  setup: Setup
  onChange: (patch: Partial<Setup>) => void
  onStart: (words: Word[]) => void
}) {
  const reviews = useLiveQuery(() => db.reviews.where('deckId').anyOf(study.deckIds).filter((r) => r.mode === 'test').toArray(), [study.deckIds.join()])
  const history = useMemo(() => (reviews ? testHistory(reviews) : []), [reviews])

  const topics = useMemo(() => {
    const counts = new Map<string, number>()
    for (const w of pool) if (w.tags?.[0]) counts.set(w.tags[0], (counts.get(w.tags[0]) ?? 0) + 1)
    return [...counts].filter(([, n]) => n >= MIN_TEST_WORDS).sort((a, b) => a[0].localeCompare(b[0]))
  }, [pool])

  const words =
    setup.source === 'all' ? pool : setup.source === 'difficult' ? pool.filter((w) => difficult.has(w.id)) : pool.filter((w) => w.tags?.[0] === setup.source)
  const set = onChange
  const tooFew = pool.length < MIN_TEST_POOL
  const count = Math.min(setup.length, words.length)

  return (
    <div className="page test-setup">
      <h1>{t('מבחן')}</h1>
      <p className="muted">{t('שאלות מסוגים שונים על המילים שלמדת, עם ציון באחוזים בסוף. המבחן לא משנה את לוח החזרות. מילים שתטעה בהן יתווספו למילים הקשות.')}</p>
      {tooFew ? (
        <div className="warn">{t('כדי להיבחן צריך לפחות {n} מילים שכבר למדת. כרגע יש {count}.', { n: MIN_TEST_POOL, count: pool.length })}</div>
      ) : (
        <>
          <h2>{t('רמה')}</h2>
          <div className="choice-row">
            {TEST_LEVELS.map((l) => (
              <button key={l} className={`choice ${setup.level === l ? 'on' : ''}`} onClick={() => set({ level: l })}>
                <b>{LEVEL_NAMES[l]()}</b>
                <span>{LEVEL_HINTS[l]()}</span>
              </button>
            ))}
          </div>

          <h2>{t('מספר שאלות')}</h2>
          <div className="choice-row amounts">
            {TEST_LENGTHS.map((n) => (
              <button key={n} className={`choice ${setup.length === n ? 'on' : ''}`} onClick={() => set({ length: n })}>
                <b>{n}</b>
              </button>
            ))}
          </div>

          <h2>{t('על אילו מילים')}</h2>
          <select value={setup.source} onChange={(e) => set({ source: e.target.value })}>
            <option value="all">{t('כל המילים שלמדתי ({n})', { n: pool.length })}</option>
            <option value="difficult" disabled={difficult.size < MIN_TEST_WORDS}>{t('המילים הקשות ({n})', { n: pool.filter((w) => difficult.has(w.id)).length })}</option>
            {topics.map(([topic, n]) => (
              <option key={topic} value={topic}>{t('נושא: {topic} ({n})', { topic, n })}</option>
            ))}
          </select>

          <label className="check-row">
            <input type="checkbox" checked={setup.timed} onChange={(e) => set({ timed: e.target.checked })} />
            <Timer size={18} /> {t('הגבלת זמן לכל שאלה')}
          </label>

          {count < setup.length && words.length >= MIN_TEST_WORDS && (
            <p className="muted">{t('יש {n} מילים בבחירה הזו, אז המבחן יכלול {n} שאלות.', { n: count })}</p>
          )}
          <button className="btn big" disabled={words.length < MIN_TEST_WORDS} onClick={() => onStart(words)}>
            <ClipboardCheck size={20} /> {t('להתחיל את המבחן')}
          </button>
        </>
      )}

      {history.length > 0 && <History history={history} />}
    </div>
  )
}

function History({ history }: { history: ReturnType<typeof testHistory> }) {
  const recent = history.slice(-12)
  const avg = Math.round(recent.reduce((n, x) => n + x.percent, 0) / recent.length)
  return (
    <section className="test-history">
      <h2>{t('המבחנים שלך')}</h2>
      <p className="muted">
        {history.length === 1
          ? t('מבחן אחד · ציון {avg}%', { avg })
          : t('{n} מבחנים · ממוצע {avg}% · שיא {best}%', { n: history.length, avg, best: Math.max(...history.map((x) => x.percent)) })}
      </p>
      <div className="test-bars" dir="ltr" role="img" aria-label={t('ציוני המבחנים האחרונים')}>
        {recent.map((x) => (
          <div key={x.id} className="test-bar" title={`${new Date(x.at).toLocaleDateString()} · ${LEVEL_NAMES[x.level]()} · ${x.percent}%`}>
            <span className="test-bar-value">{x.percent}</span>
            <span className={`test-bar-fill ${grade(x.percent)}`} style={{ height: `${Math.max(4, x.percent)}%` }} />
          </div>
        ))}
      </div>
      <ul className="test-list">
        {[...history].reverse().slice(0, 5).map((x) => (
          <li key={x.id}>
            <span>{new Date(x.at).toLocaleDateString()}</span>
            <span className="muted">{LEVEL_NAMES[x.level]()} · {t('{n} שאלות', { n: x.questions })}</span>
            <b className={grade(x.percent)}><bdi>{x.percent}%</bdi></b>
          </li>
        ))}
      </ul>
    </section>
  )
}

const grade = (percent: number) => (percent >= 85 ? 'high' : percent >= 60 ? 'mid' : 'low')

// ---- Running ----------------------------------------------------------------

interface Answered {
  q: TestQuestion
  items: ItemResult[]
}

function Runner({ running, lang, onDone }: { running: Running; lang: { target: string; source: string }; onDone: (results: Answered[], since: number) => void }) {
  const { timed, ref } = running
  // Questions can change on the way: "can't listen now" turns the listening ones into silent ones.
  const [questions, setQuestions] = useState(running.questions)
  const [n, setN] = useState(0)
  const [answered, setAnswered] = useState<ItemResult[] | null>(null)
  const results = useRef<Answered[]>([])
  const startedAt = useRef(Date.now())
  const askedAt = useRef(Date.now())
  const q = questions[n]
  const [left, setLeft] = useState(() => secondsFor(questions[0]))

  useEffect(() => {
    if (!timed || answered || left <= 0) return
    const id = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [timed, answered, left])

  function answer(items: ItemResult[]) {
    if (answered) return
    setAnswered(items)
    results.current[n] = { q, items }
    logTestAnswer({ ...ref, q: n }, q.kind, items, Date.now() - askedAt.current)
    // A fully right answer moves on by itself; anything else waits, so the right answer can be read
    if (questionScore(items) === 1) setTimeout(() => next(), 900)
  }

  function next() {
    if (n + 1 >= questions.length) return onDone(results.current, startedAt.current)
    setN((i) => i + 1)
    setAnswered(null)
    setLeft(secondsFor(questions[n + 1]))
    askedAt.current = Date.now()
  }

  /** This and every later listening question, without sound – no penalty, nothing is logged for the swap. */
  function noAudio() {
    const next = questions.map((x, i) => (i >= n ? withoutAudio(x) : x))
    setQuestions(next)
    setLeft(secondsFor(next[n]))
    askedAt.current = Date.now()
  }

  const score = answered ? questionScore(answered) : 0
  const wrong = answered?.filter((i) => !i.correct) ?? []
  return (
    <div className="page test-run">
      <div className="game-bar">
        <ProgressBar value={(n + (answered ? 1 : 0)) / questions.length} />
        {timed && <span className={`game-timer ${left <= 5 ? 'low' : ''}`}><Timer size={18} /> <bdi>{left}</bdi></span>}
        <span className="game-points"><bdi>{n + 1} / {questions.length}</bdi></span>
      </div>

      <TestQuestionView key={`${n}-${q.kind}`} q={q} langs={lang} answered={answered} timeUp={timed && left <= 0} onAnswer={answer} onNoAudio={noAudio} />

      {answered && (
        <div className={`feedback ${score === 1 ? 'correct' : score > 0 ? 'almost' : 'wrong'}`}>
          <div className="fb-title">
            {score === 1 ? <><CircleCheck size={20} /> {t('נכון!')}</> : score > 0 ? <><TriangleAlert size={20} /> {t('כמעט')}</> : <><CircleX size={20} /> {timed && left <= 0 ? t('נגמר הזמן') : t('התשובה הנכונה:')}</>}
          </div>
          {q.kind === 'match'
            ? wrong.map((i) => <Pair key={i.word.id} word={i.word} lang={lang} />)
            : score < 1 && <Pair word={q.word} lang={lang} />}
          {score < 1 && (
            <button className="btn" autoFocus onClick={next}>{n + 1 >= questions.length ? t('לתוצאות') : t('המשך')}</button>
          )}
        </div>
      )}
    </div>
  )
}

function Pair({ word, lang }: { word: Word; lang: { target: string; source: string } }) {
  return (
    <div className="fb-answer">
      <span dir={dirOf(lang.target)}><Term word={word} className="term" /></span>
      <span className="muted"> = <T>{word.translations.join(', ')}</T></span>
    </div>
  )
}

// ---- Results ----------------------------------------------------------------

function message(percent: number): string {
  if (percent === 100) return t('מושלם! אין אף טעות')
  if (percent >= 90) return t('מצוין!')
  if (percent >= 75) return t('טוב מאוד!')
  if (percent >= 60) return t('יפה! יש עוד כמה מילים לחזק')
  return t('כדאי לחזור על המילים האלה ולנסות שוב')
}

function Results({ results, since, marked, lang, onAgain }: { results: Answered[]; since: number; marked: number; lang: { target: string; source: string }; onAgain: () => void }) {
  const percent = testPercent(results.map((r) => questionScore(r.items)))
  const mistakes = results.flatMap((r) => r.items.filter((i) => !i.correct || i.almost).map((i) => ({ ...i, kind: r.q.kind })))
  return (
    <div className="page test-results">
      <div className="center-text">
        <div className={`test-percent ${grade(percent)}`}><bdi>{percent}%</bdi></div>
        <h1>{message(percent)}</h1>
        <p className="muted">
          {t('{right} מתוך {total} שאלות נכונות לגמרי', { right: results.filter((r) => questionScore(r.items) === 1).length, total: results.length })}
        </p>
      </div>

      {mistakes.length > 0 && (
        <section>
          <h2>{t('הטעויות שלך')}</h2>
          <ul className="mistakes">
            {mistakes.map((m, i) => (
              <li key={i} className={m.correct ? 'almost' : 'wrong'}>
                <div>
                  <span dir={dirOf(lang.target)}><b><Term word={m.word} /></b></span> = <T>{m.word.translations[0]}</T>
                </div>
                {m.given ? (
                  <small className="muted">{t('ענית:')} <T>{m.given}</T></small>
                ) : m.given === '' ? (
                  <small className="muted">{t('לא נענתה')}</small>
                ) : null}
              </li>
            ))}
          </ul>
          {marked > 0 && (
            <div className="row center wrap">
              <p className="muted">{marked === 1 ? t('מילה אחת שטעית בה נוספה למילים הקשות.') : t('{n} מילים שטעית בהן נוספו למילים הקשות.', { n: marked })}</p>
              <Link className="btn secondary" to="/difficult">{t('לתרגל אותן עכשיו')}</Link>
            </div>
          )}
        </section>
      )}

      <SessionReward since={since} />
      <div className="row center">
        <button className="btn" autoFocus onClick={onAgain}>{t('מבחן חדש')}</button>
        <Link className="btn secondary" to="/">{t('לדף הבית')}</Link>
      </div>
    </div>
  )
}
