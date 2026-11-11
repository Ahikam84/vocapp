import { Check, Volume2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { acceptedTerms, type AnswerResult, checkAnswer } from '../lib/answer'
import type { Word } from '../lib/db'
import { shuffled } from '../lib/games'
import { dirOf, t } from '../lib/i18n'
import type { ItemResult, QuestionKind, TestQuestion } from '../lib/test'
import { speak } from '../lib/tts'
import { SPECIAL_CHARS, toHebrewKeys } from '../lib/useDeck'
import { T, Term } from './common'
import { HebrewKeyboard } from './Exercise'

export const PROMPTS: Record<QuestionKind, string> = {
  'choice-meaning': 'מה פירוש המילה?',
  'choice-term': 'בחרו את המילה',
  truefalse: 'האם זה התרגום הנכון?',
  match: 'התאימו כל מילה לתרגום שלה',
  listen: 'מה שמעת?',
  cloze: 'השלימו את המשפט',
  'type-meaning': 'כתבו את התרגום',
  'type-term': 'כתבו את המילה',
  'cloze-type': 'כתבו את המילה שחסרה',
  dictation: 'כתבו את המילה ששמעתם',
}

interface Langs {
  /** The language being learned, and the one the learner knows */
  target: string
  source: string
}

interface Props {
  q: TestQuestion
  langs: Langs
  /** Set once answered: the question then shows what was right */
  answered: ItemResult[] | null
  /** The time for this question ran out: report whatever was done so far */
  timeUp: boolean
  onAnswer: (items: ItemResult[]) => void
}

/** One test question, of any kind. */
export function TestQuestionView(props: Props) {
  const { q, langs, answered, timeUp, onAnswer } = props
  const { kind, word } = q

  // Out of time: an unanswered question counts as wrong (matching keeps the pairs already found)
  useEffect(() => {
    if (timeUp && !answered && kind !== 'match') onAnswer([{ word, correct: false, given: '' }])
  }, [timeUp]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listening questions play the word as they appear
  useEffect(() => {
    if (kind === 'listen' || kind === 'dictation') speak(word.term, langs.target)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const one = (correct: boolean, given: string, almost = false) => onAnswer([{ word, correct, almost, given }])
  const typed = (r: AnswerResult, given: string) => one(r !== 'wrong', given, r === 'almost')
  const result = answered?.[0]

  return (
    <div className={`test-q ${result ? `fb-${result.correct ? (result.almost ? 'almost' : 'correct') : 'wrong'}` : ''}`}>
      <div className="prompt-label">{t(PROMPTS[kind])}</div>

      {(kind === 'choice-meaning' || kind === 'type-meaning') && (
        <div className="card prompt" dir={dirOf(langs.target)}><Term word={word} className="term huge" /></div>
      )}
      {(kind === 'choice-term' || kind === 'type-term') && (
        <div className="card prompt"><T className="term huge">{word.translations[0]}</T></div>
      )}
      {(kind === 'listen' || kind === 'dictation') && (
        <div className="test-play">
          <button className="play-big" onClick={() => speak(word.term, langs.target)} aria-label={t('השמע שוב')}><Volume2 size={40} /></button>
          {answered && <div dir={dirOf(langs.target)}><Term word={word} className="term huge" /></div>}
        </div>
      )}
      {(kind === 'cloze' || kind === 'cloze-type') && q.cloze && (
        <>
          <div className="card cloze-sentence" dir={dirOf(langs.target)}>
            {q.cloze.before}
            <span className={`cloze-blank ${answered ? (result?.correct ? 'ok' : 'reveal') : ''}`}>{answered ? q.cloze.answer : '   '}</span>
            {q.cloze.after}
          </div>
          {answered && word.exampleReading && <p className="reading center-text" dir="auto">{word.exampleReading}</p>}
          {word.exampleTranslation && <p className="muted center-text"><T>{word.exampleTranslation}</T></p>}
        </>
      )}

      {(kind === 'choice-meaning' || kind === 'listen') && (
        <Choices options={q.options!} right={word} label={(w) => w.translations[0]} dir={dirOf(langs.source)} answered={result} onPick={(w) => one(w.id === word.id, w.translations[0])} />
      )}
      {kind === 'choice-term' && (
        <Choices options={q.options!} right={word} label={(w) => w.term} show={(w) => <Term word={w} />} dir={dirOf(langs.target)} answered={result} onPick={(w) => one(w.id === word.id, w.term)} />
      )}
      {kind === 'cloze' && (
        <Choices
          options={q.clozeOptions!}
          right={q.cloze!.answer}
          label={(o) => o}
          dir={dirOf(langs.target)}
          answered={result}
          onPick={(o) => one(o === q.cloze!.answer, o)}
        />
      )}
      {kind === 'truefalse' && <TrueFalseQ q={q} langs={langs} answered={result} onAnswer={(ok, given) => one(ok, given)} />}
      {kind === 'match' && <Match pairs={q.pairs!} langs={langs} answered={answered} timeUp={timeUp} onAnswer={onAnswer} />}

      {kind === 'type-term' || kind === 'dictation' ? (
        <Typing accepted={acceptedTerms(word)} lang={langs.target} learner answered={result} onAnswer={typed} />
      ) : kind === 'cloze-type' ? (
        // The blank is the word as the sentence has it; when that's the word itself, its other spellings
        // (and transliteration) count too
        <Typing accepted={q.cloze!.bare ? [q.cloze!.answer] : [q.cloze!.answer, ...acceptedTerms(word)]} lang={langs.target} learner answered={result} onAnswer={typed} />
      ) : kind === 'type-meaning' ? (
        <Typing accepted={word.translations} lang={langs.source} answered={result} onAnswer={typed} />
      ) : null}
    </div>
  )
}

function Choices<O extends Word | string>({
  options,
  right,
  label,
  show,
  dir,
  answered,
  onPick,
}: {
  options: O[]
  right: O
  label: (o: O) => string
  /** How an option looks, when it's more than its label */
  show?: (o: O) => React.ReactNode
  dir: 'rtl' | 'ltr'
  answered?: ItemResult
  onPick: (o: O) => void
}) {
  const key = (o: O) => (typeof o === 'string' ? o : o.id)
  const isRight = (o: O) => key(o) === key(right)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1
      if (!answered && i >= 0 && i < options.length) onPick(options[i])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <div className="options">
      {options.map((o, i) => {
        const state = !answered ? '' : isRight(o) ? 'right' : label(o) === answered.given ? 'wrong' : 'dim'
        return (
          <button key={key(o)} className={`option ${state}`} disabled={!!answered} onClick={() => onPick(o)} dir={dir}>
            <span className="key">{i + 1}</span>
            {show ? show(o) : <T>{label(o)}</T>}
          </button>
        )
      })}
    </div>
  )
}

function TrueFalseQ({ q, langs, answered, onAnswer }: { q: TestQuestion; langs: Langs; answered?: ItemResult; onAnswer: (ok: boolean, given: string) => void }) {
  const tf = q.truefalse!
  const say = (yes: boolean) => !answered && onAnswer(yes === tf.truth, yes ? t('נכון') : t('לא נכון'))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '1') say(true)
      else if (e.key === '2') say(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const struck = !!answered && !tf.truth
  return (
    <>
      <div className={`card tf-card ${answered ? (answered.correct ? 'ok' : 'bad') : ''}`}>
        <div className="tf-term" dir={dirOf(langs.target)}><Term word={q.word} /></div>
        <div className="tf-eq">=</div>
        <div className={`tf-shown ${struck ? 'struck' : ''}`}><T>{tf.shown}</T></div>
        {struck && <div className="tf-right"><T>{q.word.translations[0]}</T></div>}
      </div>
      <div className="tf-buttons">
        <button className="btn big yes" disabled={!!answered} onClick={() => say(true)}><Check size={22} /> {t('נכון')}</button>
        <button className="btn big no" disabled={!!answered} onClick={() => say(false)}><X size={22} /> {t('לא נכון')}</button>
      </div>
    </>
  )
}

/** Four words and four meanings: tap one on each side. A word counts if it was matched without a wrong try. */
function Match({ pairs, langs, answered, timeUp, onAnswer }: { pairs: Word[]; langs: Langs; answered: ItemResult[] | null; timeUp: boolean; onAnswer: (items: ItemResult[]) => void }) {
  const [terms] = useState(() => shuffled(pairs))
  const [meanings] = useState(() => shuffled(pairs))
  const [sel, setSel] = useState<{ side: 'term' | 'meaning'; id: string } | null>(null)
  const [matched, setMatched] = useState<string[]>([])
  const [missed, setMissed] = useState<string[]>([])
  const [flash, setFlash] = useState<string[]>([])

  const report = (found: string[]) =>
    onAnswer(pairs.map((w) => ({ word: w, correct: found.includes(w.id) && !missed.includes(w.id), given: found.includes(w.id) ? undefined : '' })))

  useEffect(() => {
    if (timeUp && !answered) report(matched)
  }, [timeUp]) // eslint-disable-line react-hooks/exhaustive-deps

  function tap(side: 'term' | 'meaning', id: string) {
    if (answered || matched.includes(id)) return
    if (!sel || sel.side === side) return setSel({ side, id })
    setSel(null)
    if (sel.id === id) {
      const found = [...matched, id]
      setMatched(found)
      if (found.length === pairs.length) report(found)
    } else {
      // The miss counts against the word on the left (the one being matched)
      const termId = side === 'term' ? id : sel.id
      setMissed((m) => (m.includes(termId) ? m : [...m, termId]))
      setFlash([`${sel.side}:${sel.id}`, `${side}:${id}`])
      setTimeout(() => setFlash([]), 500)
    }
  }

  const cls = (side: 'term' | 'meaning', id: string) => {
    const done = matched.includes(id) || !!answered
    return `match-card ${done ? (missed.includes(id) || !matched.includes(id) ? 'done late' : 'done') : ''} ${sel?.side === side && sel.id === id ? 'on' : ''} ${flash.includes(`${side}:${id}`) ? 'bad' : ''}`
  }
  return (
    <div className="match-grid">
      <div>
        {terms.map((w) => (
          <button key={w.id} className={cls('term', w.id)} onClick={() => tap('term', w.id)} dir={dirOf(langs.target)}><Term word={w} /></button>
        ))}
      </div>
      <div>
        {meanings.map((w) => (
          <button key={w.id} className={cls('meaning', w.id)} onClick={() => tap('meaning', w.id)} dir={dirOf(langs.source)}><T>{w.translations[0]}</T></button>
        ))}
      </div>
    </div>
  )
}

/**
 * A typed answer. Accepted at once when it matches exactly; otherwise checked on Enter.
 * `learner`: typed in the language being learned (Hebrew then gets the on-screen keyboard).
 */
function Typing({ accepted, lang, learner, answered, onAnswer }: { accepted: string[]; lang: string; learner?: boolean; answered?: ItemResult; onAnswer: (r: AnswerResult, given: string) => void }) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)

  function update(next: string) {
    if (answered) return
    setValue(next)
    if (checkAnswer(next, accepted).result === 'correct') onAnswer('correct', next)
  }
  function submit() {
    if (answered) return
    if (!value.trim()) return onAnswer('wrong', '')
    onAnswer(checkAnswer(value, accepted).result, value)
  }

  return (
    <form
      className="typing"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <input
        ref={input}
        dir={dirOf(lang)}
        lang={lang}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={answered ? (answered.given ?? value) : value}
        readOnly={!!answered}
        onChange={(e) => update(lang === 'he' ? toHebrewKeys(e.target.value) : e.target.value)}
      />
      {learner && lang === 'he' && !answered && (
        <HebrewKeyboard
          onKey={(c) => {
            update(c === '⌫' ? value.slice(0, -1) : value + c)
            input.current?.focus()
          }}
        />
      )}
      {SPECIAL_CHARS[lang] && !answered && (
        <div className="char-row">
          {SPECIAL_CHARS[lang].map((c) => (
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
  )
}
