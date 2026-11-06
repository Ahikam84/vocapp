import { useEffect, useMemo, useRef, useState } from 'react'
import type { Deck, ExerciseType, Word } from '../lib/db'
import { checkAnswer, type AnswerResult } from '../lib/answer'
import { pickDistractors, shuffle } from '../lib/session'
import { speak } from '../lib/tts'
import { SPECIAL_CHARS } from '../lib/useDeck'
import { SpeakButton, T } from './common'

export interface ExerciseOutcome {
  correct: boolean
  almost: boolean
  responseMs: number
}

interface Props {
  word: Word
  exercise: ExerciseType
  deck: Deck
  /** Other words of the deck, used to build wrong options */
  pool: Word[]
  autoPlay: boolean
  onDone: (outcome: ExerciseOutcome) => void
}

const PROMPTS: Record<ExerciseType, string> = {
  intro: 'מילה חדשה',
  'choice-target': 'מה הפירוש?',
  'choice-source': 'איך אומרים?',
  'audio-choice': 'מה שמעת?',
  tiles: 'הרכב את המילה',
  typing: 'כתוב את המילה',
}

export default function Exercise(props: Props) {
  const { word, exercise, deck, autoPlay } = props
  const startedAt = useRef(performance.now())
  const [feedback, setFeedback] = useState<{ result: AnswerResult; given?: string } | null>(null)

  const playsTermUpfront = exercise === 'intro' || exercise === 'choice-target' || exercise === 'audio-choice'
  useEffect(() => {
    if (playsTermUpfront && (autoPlay || exercise === 'audio-choice')) speak(word.term, deck.targetLang)
  }, [word.id, exercise]) // eslint-disable-line react-hooks/exhaustive-deps

  // Set only when the user has to acknowledge the feedback (mistakes, near-misses).
  const pending = useRef<ExerciseOutcome | null>(null)

  function finish(result: AnswerResult, given?: string) {
    if (feedback) return
    const outcome: ExerciseOutcome = {
      correct: result !== 'wrong',
      almost: result === 'almost',
      responseMs: performance.now() - startedAt.current,
    }
    // Hearing the word again right after answering reinforces the sound–meaning link.
    if (autoPlay && !playsTermUpfront) speak(word.term, deck.targetLang)
    setFeedback({ result, given })
    if (result === 'correct') {
      const recall = exercise === 'typing' || exercise === 'tiles'
      setTimeout(() => props.onDone(outcome), recall ? 900 : 650)
      return
    }
    pending.current = outcome
  }
  // Enter on the focused button and the window key listener can both fire – only advance once.
  const advanced = useRef(false)
  const proceed = () => {
    if (!pending.current || advanced.current) return
    advanced.current = true
    props.onDone(pending.current)
  }

  useEffect(() => {
    if (!feedback || !pending.current) return
    const onKey = (e: KeyboardEvent) => e.key === 'Enter' && proceed()
    // Delay so the Enter that submitted the answer doesn't also skip the feedback.
    const t = setTimeout(() => window.addEventListener('keydown', onKey), 200)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [feedback]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`exercise ${feedback ? `fb-${feedback.result}` : ''}`}>
      <div className="prompt-label">{PROMPTS[exercise]}</div>
      {exercise === 'intro' && <Intro {...props} />}
      {(exercise === 'choice-target' || exercise === 'choice-source' || exercise === 'audio-choice') && (
        <Choice {...props} answered={feedback} onAnswer={finish} />
      )}
      {exercise === 'tiles' && <Tiles {...props} answered={!!feedback} onAnswer={finish} />}
      {exercise === 'typing' && <Typing {...props} answered={!!feedback} onAnswer={finish} />}

      {feedback && pending.current && (
        <div className={`feedback ${feedback.result}`}>
          <div className="fb-title">
            {feedback.result === 'correct' ? '✓ נכון!' : feedback.result === 'almost' ? '≈ כמעט! שים לב לכתיב:' : '✗ התשובה הנכונה:'}
          </div>
          <div className="fb-answer">
            <T className="term">{word.term}</T> <SpeakButton text={word.term} lang={deck.targetLang} small />
            <span className="muted"> = {word.translations.join(', ')}</span>
          </div>
          {feedback.given && feedback.result !== 'correct' && (
            <div className="muted">
              כתבת: <T>{feedback.given}</T>
            </div>
          )}
          {word.hint && feedback.result === 'wrong' && <div className="hint">💡 {word.hint}</div>}
          <button className="btn" autoFocus onClick={proceed}>המשך ↵</button>
        </div>
      )}
      {exercise === 'intro' && (
        <button className="btn big" autoFocus onClick={() => props.onDone({ correct: true, almost: false, responseMs: 0 })}>
          הבנתי, הלאה ←
        </button>
      )}
    </div>
  )
}

function Intro({ word, deck }: Props) {
  return (
    <div className="card intro">
      <div className="row center">
        <T className="term huge">{word.term}</T>
        <SpeakButton text={word.term} lang={deck.targetLang} />
      </div>
      <div className="translation">{word.translations.join(', ')}</div>
      {word.example && (
        <div className="example">
          <T>{word.example}</T> <SpeakButton text={word.example} lang={deck.targetLang} small />
          {word.exampleTranslation && <div className="muted">{word.exampleTranslation}</div>}
        </div>
      )}
      {word.hint && <div className="hint">💡 {word.hint}</div>}
    </div>
  )
}

function Choice({
  word, exercise, deck, pool, answered, onAnswer,
}: Props & { answered: { result: AnswerResult; given?: string } | null; onAnswer: (r: AnswerResult, given?: string) => void }) {
  const showTerms = exercise === 'choice-source'
  const label = (w: Word) => (showTerms ? w.term : w.translations[0])
  const options = useMemo(
    () => shuffle([word, ...pickDistractors(word, pool, label, 3)]),
    [word.id, exercise], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= options.length) pick(options[n - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function pick(w: Word) {
    if (answered) return
    onAnswer(w.id === word.id ? 'correct' : 'wrong', label(w))
  }

  return (
    <>
      <div className="card prompt">
        {exercise === 'choice-target' && (
          <div className="row center">
            <T className="term huge">{word.term}</T>
            <SpeakButton text={word.term} lang={deck.targetLang} />
          </div>
        )}
        {exercise === 'choice-source' && <div className="term huge">{word.translations[0]}</div>}
        {exercise === 'audio-choice' && (
          <button className="play-big" onClick={() => speak(word.term, deck.targetLang)}>🔊</button>
        )}
      </div>
      <div className="options">
        {options.map((o, i) => {
          const state = !answered ? '' : o.id === word.id ? 'right' : answered.given === label(o) ? 'wrong' : 'dim'
          return (
            <button key={o.id} className={`option ${state}`} onClick={() => pick(o)}>
              <span className="key">{i + 1}</span>
              {showTerms ? <T>{o.term}</T> : o.translations[0]}
            </button>
          )
        })}
      </div>
    </>
  )
}

const EXTRA_LETTERS = 'aeioulnrst'

function Tiles({ word, answered, onAnswer }: Props & { answered: boolean; onAnswer: (r: AnswerResult, given?: string) => void }) {
  const tiles = useMemo(() => {
    const letters = [...word.term.toLowerCase()]
    const extra = shuffle([...EXTRA_LETTERS].filter((c) => !letters.includes(c))).slice(0, 2)
    return shuffle([...letters, ...extra]).map((c, i) => ({ c, i }))
  }, [word.id])
  const [used, setUsed] = useState<number[]>([])
  const built = used.map((i) => tiles[i].c).join('')

  function tap(i: number) {
    if (answered || used.includes(i)) return
    const next = [...used, i]
    setUsed(next)
    if (next.length === word.term.length) {
      const given = next.map((j) => tiles[j].c).join('')
      onAnswer(checkAnswer(given, [word.term]).result === 'correct' ? 'correct' : 'wrong', given)
    }
  }

  return (
    <>
      <div className="card prompt">
        <div className="term huge">{word.translations[0]}</div>
      </div>
      <div className="tiles-answer" dir="ltr" onClick={() => !answered && setUsed(used.slice(0, -1))}>
        {built || <span className="muted">&nbsp;</span>}
        {!answered && <span className="caret" />}
      </div>
      <div className="tiles" dir="ltr">
        {tiles.map(({ c, i }) => (
          <button key={i} className="tile" disabled={used.includes(i) || answered} onClick={() => tap(i)}>
            {c === ' ' ? '␣' : c}
          </button>
        ))}
      </div>
      {!answered && (
        <div className="row center">
          <button className="btn secondary" onClick={() => setUsed(used.slice(0, -1))}>⌫ מחק</button>
          <button className="btn secondary" onClick={() => onAnswer('wrong', built)}>לא יודע</button>
        </div>
      )}
    </>
  )
}

function Typing({ word, deck, answered, onAnswer }: Props & { answered: boolean; onAnswer: (r: AnswerResult, given?: string) => void }) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)

  function submit() {
    if (answered) return
    if (!value.trim()) return onAnswer('wrong', '')
    onAnswer(checkAnswer(value, [word.term, ...(word.altTerms ?? [])]).result, value)
  }

  return (
    <>
      <div className="card prompt">
        <div className="term huge">{word.translations.join(', ')}</div>
      </div>
      <form
        className="typing"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          ref={input}
          dir="ltr"
          lang={deck.targetLang}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          readOnly={answered}
          onChange={(e) => setValue(e.target.value)}
        />
        {SPECIAL_CHARS[deck.targetLang] && !answered && (
          <div className="char-row">
            {SPECIAL_CHARS[deck.targetLang].map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => {
                  setValue(value + c)
                  input.current?.focus()
                }}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        {!answered && (
          <div className="row center">
            <button className="btn" type="submit">בדיקה ↵</button>
            <button className="btn secondary" type="button" onClick={() => onAnswer('wrong', value)}>לא יודע</button>
          </div>
        )}
      </form>
    </>
  )
}
