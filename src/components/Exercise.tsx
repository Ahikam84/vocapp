import { ArrowLeft, CircleCheck, CircleX, Delete, Keyboard, Lightbulb, TriangleAlert, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Deck, ExerciseType, Word } from '../lib/db'
import { checkAnswer, stripAccents, type AnswerResult } from '../lib/answer'
import { pickDistractors, shuffle } from '../lib/session'
import { dirOf, t } from '../lib/i18n'
import { speak } from '../lib/tts'
import { DECOY_LETTERS, HEBREW_KEYBOARD, SPECIAL_CHARS, toHebrewKeys } from '../lib/useDeck'
import { Meter, SpeakButton, T } from './common'

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
  /** Strength bars above the question: the level now, and what an answer turns it into. */
  meter?: MeterInfo
}

export interface MeterInfo {
  level: number
  max: number
  label: (level: number) => string
  after: (outcome: ExerciseOutcome) => number
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
  const { word, deck, autoPlay } = props
  // With sound off, a listening question can't be answered – show the word instead.
  const exercise: ExerciseType = props.exercise === 'audio-choice' && !autoPlay ? 'choice-target' : props.exercise
  const startedAt = useRef(performance.now())
  const [feedback, setFeedback] = useState<{ result: AnswerResult; given?: string } | null>(null)
  const [meterLevel, setMeterLevel] = useState<number | null>(null)

  const playsTermUpfront = exercise === 'intro' || exercise === 'choice-target' || exercise === 'audio-choice'
  useEffect(() => {
    if (playsTermUpfront && autoPlay) speak(word.term, deck.targetLang)
  }, [word.id, exercise]) // eslint-disable-line react-hooks/exhaustive-deps

  // Set only when the user has to acknowledge the feedback (mistakes, near-misses).
  const pending = useRef<ExerciseOutcome | null>(null)

  /** `helped`: right in the end, but with a hint – shown as correct, scheduled as a harder word. */
  function finish(result: AnswerResult, given?: string, helped = false) {
    if (feedback) return
    const outcome: ExerciseOutcome = {
      correct: result !== 'wrong',
      almost: result === 'almost' || (helped && result === 'correct'),
      responseMs: performance.now() - startedAt.current,
    }
    // Hearing the word again right after answering reinforces the sound–meaning link.
    if (autoPlay && !playsTermUpfront) speak(word.term, deck.targetLang)
    if (props.meter) setMeterLevel(props.meter.after(outcome))
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
      {props.meter && exercise !== 'intro' && (
        <Meter
          level={meterLevel ?? props.meter.level}
          prev={props.meter.level}
          max={props.meter.max}
          label={props.meter.label(meterLevel ?? props.meter.level)}
        />
      )}
      <div className="prompt-label">{t(PROMPTS[exercise])}</div>
      {exercise === 'intro' && <Intro {...props} />}
      {(exercise === 'choice-target' || exercise === 'choice-source' || exercise === 'audio-choice') && (
        <Choice {...props} exercise={exercise} answered={feedback} onAnswer={finish} />
      )}
      {exercise === 'tiles' && <Tiles {...props} answered={!!feedback} onAnswer={finish} />}
      {exercise === 'typing' && <Typing {...props} answered={!!feedback} onAnswer={finish} />}

      {feedback && pending.current && (
        <div className={`feedback ${feedback.result}`}>
          <div className="fb-title">
            {feedback.result === 'correct' ? (
              <><CircleCheck size={18} /> {t('נכון!')}</>
            ) : feedback.result === 'almost' ? (
              <><TriangleAlert size={18} /> {t('כמעט! שים לב לכתיב:')}</>
            ) : (
              <><CircleX size={18} /> {t('התשובה הנכונה:')}</>
            )}
          </div>
          <div className="fb-answer">
            <T className="term">{word.term}</T> <SpeakButton text={word.term} lang={deck.targetLang} small />
            <span className="muted"> = <T>{word.translations.join(', ')}</T></span>
          </div>
          {feedback.given && feedback.result !== 'correct' && (
            <div className="muted">
              {t('כתבת:')} <T>{feedback.given}</T>
            </div>
          )}
          {word.hint && feedback.result === 'wrong' && <div className="hint"><Lightbulb size={16} /> {word.hint}</div>}
          <button className="btn" autoFocus onClick={proceed}>{t('המשך')}</button>
        </div>
      )}
      {exercise === 'intro' && (
        <button className="btn big" autoFocus onClick={() => props.onDone({ correct: true, almost: false, responseMs: 0 })}>
          {t('הבנתי, הלאה')} <ArrowLeft className="flip" size={18} />
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
      <div className="translation"><T>{word.translations.join(', ')}</T></div>
      {word.example && (
        <div className="example">
          <T>{word.example}</T> <SpeakButton text={word.example} lang={deck.targetLang} small />
          {word.exampleTranslation && <div className="muted"><T>{word.exampleTranslation}</T></div>}
        </div>
      )}
      {word.hint && <div className="hint"><Lightbulb size={16} /> {word.hint}</div>}
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
        {exercise === 'choice-source' && <T className="term huge">{word.translations[0]}</T>}
        {exercise === 'audio-choice' && (
          <button className="play-big" onClick={() => speak(word.term, deck.targetLang)} aria-label={t('השמע שוב')}><Volume2 size={40} /></button>
        )}
      </div>
      <div className="options">
        {options.map((o, i) => {
          const state = !answered ? '' : o.id === word.id ? 'right' : answered.given === label(o) ? 'wrong' : 'dim'
          return (
            <button key={o.id} className={`option ${state}`} onClick={() => pick(o)}>
              <span className="key">{i + 1}</span>
              <T>{showTerms ? o.term : o.translations[0]}</T>
            </button>
          )
        })}
      </div>
    </>
  )
}

function Tiles({ word, deck, answered, onAnswer }: Props & { answered: boolean; onAnswer: (r: AnswerResult, given?: string, helped?: boolean) => void }) {
  const tiles = useMemo(() => {
    const letters = [...word.term.toLowerCase()]
    const decoys = DECOY_LETTERS[deck.targetLang] ?? 'aeioulnrst'
    const extra = shuffle([...decoys].filter((c) => !letters.includes(c))).slice(0, 2)
    return shuffle([...letters, ...extra]).map((c, i) => ({ c, i }))
  }, [word.id])
  const [used, setUsedState] = useState<number[]>([])
  // Mirrors `used` synchronously so fast typing never reads a stale value.
  const usedRef = useRef<number[]>([])
  const setUsed = (next: number[]) => {
    usedRef.current = next
    setUsedState(next)
  }
  const built = used.map((i) => tiles[i].c).join('')

  const hinted = useRef(false)
  const answer = [...word.term.toLowerCase()]
  // Phones: a hidden text field brings up the built-in keyboard. It always holds one
  // space, so a Backspace on it can be noticed (the field gets shorter).
  const phoneInput = useRef<HTMLInputElement>(null)
  const touch = useMemo(() => window.matchMedia?.('(pointer: coarse)').matches ?? false, [])

  function tap(i: number) {
    if (answered || usedRef.current.includes(i)) return
    const next = [...usedRef.current, i]
    setUsed(next)
    if (next.length === answer.length) {
      const given = next.map((j) => tiles[j].c).join('')
      const right = checkAnswer(given, [word.term]).result === 'correct'
      // With help from the hint button it's right, but not fully remembered.
      onAnswer(right ? 'correct' : 'wrong', given, hinted.current)
    }
  }

  function erase() {
    if (!answered) setUsed(usedRef.current.slice(0, -1))
  }

  /** Uses up the tile for a typed character; returns false when no tile has it. */
  function typeChar(raw: string): boolean {
    const key = deck.targetLang === 'he' ? toHebrewKeys(raw) : raw.toLowerCase()
    const free = tiles.filter((x) => !usedRef.current.includes(x.i))
    // Exact letter first; otherwise "n" also finds "ñ", "e" finds "é", "מ" finds "ם".
    const hit = free.find((x) => x.c === key) ?? free.find((x) => stripAccents(x.c) === stripAccents(key))
    if (!hit) return false
    tap(hit.i)
    return true
  }

  /** Hint: keeps the correct start of the answer, drops anything after a mistake, and adds the next right letter. */
  function hint() {
    if (answered) return
    hinted.current = true
    let keep = 0
    while (keep < usedRef.current.length && tiles[usedRef.current[keep]].c === answer[keep]) keep++
    setUsed(usedRef.current.slice(0, keep))
    const want = answer[keep]
    const hit = tiles.find((x) => x.c === want && !usedRef.current.includes(x.i))
    if (hit) tap(hit.i)
  }

  // The computer keyboard works too: a typed letter uses up the matching tile.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (answered || e.ctrlKey || e.metaKey || e.altKey || e.target === phoneInput.current) return
      if (e.key === 'Backspace') {
        e.preventDefault()
        erase()
        return
      }
      if ([...e.key].length !== 1) return
      if (typeChar(e.key)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function onPhoneInput(e: React.FormEvent<HTMLInputElement>) {
    const value = e.currentTarget.value
    if (value.length === 0) erase()
    // Whatever was typed, wherever the cursor was: the field minus its one placeholder space.
    else for (const c of [...value.replace(' ', '')]) typeChar(c)
    e.currentTarget.value = ' '
    e.currentTarget.setSelectionRange(1, 1)
  }

  const openKeyboard = () => {
    const el = phoneInput.current
    if (!el || answered) return
    el.value = ' '
    el.focus()
    el.setSelectionRange(1, 1)
  }

  return (
    <>
      <div className="card prompt">
        <T className="term huge">{word.translations[0]}</T>
      </div>
      <div className="tiles-answer" dir={dirOf(deck.targetLang)} onClick={() => (touch ? openKeyboard() : erase())}>
        {built || <span className="muted">&nbsp;</span>}
        {!answered && <span className="caret" />}
        {touch && !answered && (
          <input
            ref={phoneInput}
            className="phone-keys"
            lang={deck.targetLang}
            defaultValue=" "
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label={t('מקלדת')}
            onInput={onPhoneInput}
          />
        )}
      </div>
      <div className="tiles" dir={dirOf(deck.targetLang)}>
        {tiles.map(({ c, i }) => (
          <button key={i} className="tile" disabled={used.includes(i) || answered} onClick={() => tap(i)}>
            {c === ' ' ? '␣' : c}
          </button>
        ))}
      </div>
      {!answered && (
        <div className="row center wrap">
          {touch && (
            <button className="btn secondary" onClick={openKeyboard}><Keyboard size={18} /> {t('מקלדת')}</button>
          )}
          <button className="btn secondary" onClick={erase}><Delete size={18} /> {t('מחק')}</button>
          <button className="btn secondary" onClick={hint}><Lightbulb size={18} /> {t('רמז')}</button>
          <button className="btn secondary" onClick={() => onAnswer('wrong', built)}>{t('לא יודע')}</button>
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

  /** Updates the text and accepts it right away once it matches exactly – no need to press Check. */
  function update(next: string) {
    if (answered) return
    setValue(next)
    if (checkAnswer(next, [word.term, ...(word.altTerms ?? [])]).result === 'correct') onAnswer('correct', next)
  }

  return (
    <>
      <div className="card prompt">
        <T className="term huge">{word.translations.join(', ')}</T>
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
          dir={dirOf(deck.targetLang)}
          lang={deck.targetLang}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          readOnly={answered}
          onChange={(e) => update(deck.targetLang === 'he' ? toHebrewKeys(e.target.value) : e.target.value)}
        />
        {deck.targetLang === 'he' && !answered && (
          <HebrewKeyboard
            onKey={(c) => {
              update(c === '⌫' ? value.slice(0, -1) : value + c)
              input.current?.focus()
            }}
          />
        )}
        {SPECIAL_CHARS[deck.targetLang] && !answered && (
          <div className="char-row">
            {SPECIAL_CHARS[deck.targetLang].map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => {
                  update(value + c)
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
            <button className="btn" type="submit">{t('בדיקה')}</button>
            <button className="btn secondary" type="button" onClick={() => onAnswer('wrong', value)}>{t('לא יודע')}</button>
          </div>
        )}
      </form>
    </>
  )
}

/** Compact on-screen Hebrew keyboard for learners whose device has no Hebrew layout. */
function HebrewKeyboard({ onKey }: { onKey: (c: string) => void }) {
  return (
    <div className="he-keyboard" dir="rtl">
      {HEBREW_KEYBOARD.map((row, i) => (
        <div key={i} className="he-row">
          {row.map((c) => (
            <button type="button" key={c} onClick={() => onKey(c)}>{c}</button>
          ))}
          {i === HEBREW_KEYBOARD.length - 1 && (
            <button type="button" className="wide" onClick={() => onKey('⌫')} aria-label={t('מחק')}>
              <Delete size={18} />
            </button>
          )}
        </div>
      ))}
      <div className="he-row">
        <button type="button" className="space" onClick={() => onKey(' ')} aria-label={t('רווח')}>&nbsp;</button>
      </div>
    </div>
  )
}
