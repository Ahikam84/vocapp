import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SpeakButton } from '../components/common'
import { db, deleteWord, newId, resetProgress as resetWordProgress, setKnown, type Deck, type Word } from '../lib/db'
import { normalize } from '../lib/answer'
import { LANGUAGES, SPECIAL_CHARS } from '../lib/useDeck'

const splitList = (s: string) => s.split(/[,/،]/).map((t) => t.trim()).filter(Boolean)

const EMPTY = { term: '', translations: '', altTerms: '', example: '', exampleTranslation: '', hint: '' }

export default function WordForm({ deck }: { deck: Deck }) {
  const { id } = useParams()
  const wordId = id
  const navigate = useNavigate()
  const termRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState(EMPTY)
  const [saved, setSaved] = useState<string | null>(null)

  const existing = useLiveQuery(() => (wordId ? db.words.get(wordId) : undefined), [wordId])
  const progress = useLiveQuery(() => (wordId ? db.progress.get(wordId) : undefined), [wordId])
  const duplicate = useLiveQuery(async () => {
    const t = normalize(form.term)
    if (!t) return undefined
    const all = await db.words.where('deckId').equals(deck.id).toArray()
    return all.find((w) => w.id !== wordId && normalize(w.term) === t)
  }, [form.term, deck.id, wordId])

  useEffect(() => {
    if (existing)
      setForm({
        term: existing.term,
        translations: existing.translations.join(', '),
        altTerms: existing.altTerms?.join(', ') ?? '',
        example: existing.example ?? '',
        exampleTranslation: existing.exampleTranslation ?? '',
        hint: existing.hint ?? '',
      })
    else if (!wordId) setForm(EMPTY)
  }, [existing, wordId])

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value })

  const insertChar = (c: string) => {
    setForm((f) => ({ ...f, term: f.term + c }))
    termRef.current?.focus()
  }

  async function save(addAnother: boolean) {
    const translations = splitList(form.translations)
    if (!form.term.trim() || translations.length === 0) return
    const data: Omit<Word, 'id'> = {
      deckId: deck.id,
      term: form.term.trim(),
      translations,
      altTerms: splitList(form.altTerms),
      example: form.example.trim() || undefined,
      exampleTranslation: form.exampleTranslation.trim() || undefined,
      hint: form.hint.trim() || undefined,
      createdAt: existing?.createdAt ?? Date.now(),
    }
    if (wordId) await db.words.update(wordId, data)
    else await db.words.add({ ...data, id: newId() })

    if (addAnother) {
      setSaved(data.term)
      setForm(EMPTY)
      termRef.current?.focus()
    } else navigate('/words')
  }

  async function remove() {
    if (wordId && confirm(`למחוק את "${form.term}"?`)) {
      await deleteWord(wordId)
      navigate('/words')
    }
  }

  async function resetProgress() {
    if (wordId && confirm('לאפס את ההתקדמות של המילה? היא תחזור לרשימת המילים החדשות.')) await resetWordProgress(wordId)
  }

  const lang = LANGUAGES[deck.targetLang] ?? deck.targetLang
  return (
    <form
      className="page form"
      onSubmit={(e) => {
        e.preventDefault()
        save(!wordId)
      }}
    >
      <h1>{wordId ? 'עריכת מילה' : 'מילה חדשה'}</h1>
      {saved && <div className="toast">✓ "{saved}" נשמרה</div>}

      <label>
        מילה ב{lang} *
        <div className="row">
          <input ref={termRef} dir="ltr" lang={deck.targetLang} value={form.term} onChange={set('term')} autoFocus required />
          {form.term && <SpeakButton text={form.term} lang={deck.targetLang} />}
        </div>
      </label>
      {SPECIAL_CHARS[deck.targetLang] && (
        <div className="char-row">
          {SPECIAL_CHARS[deck.targetLang].map((c) => (
            <button type="button" key={c} onClick={() => insertChar(c)}>{c}</button>
          ))}
        </div>
      )}
      {duplicate && <div className="warn">⚠️ המילה כבר קיימת: {duplicate.term} = {duplicate.translations.join(', ')}</div>}

      <label>
        תרגום * <small>(כמה תרגומים – מפרידים בפסיק)</small>
        <input value={form.translations} onChange={set('translations')} required />
      </label>

      <details open={!!(form.example || form.hint || form.altTerms)}>
        <summary>פרטים נוספים</summary>
        <label>
          משפט לדוגמה
          <input dir="ltr" value={form.example} onChange={set('example')} />
        </label>
        <label>
          תרגום המשפט
          <input value={form.exampleTranslation} onChange={set('exampleTranslation')} />
        </label>
        <label>
          רמז לזיכרון <small>(אסוציאציה, תמונה בראש, מילה דומה בעברית…)</small>
          <textarea rows={2} value={form.hint} onChange={set('hint')} />
        </label>
        <label>
          צורות נוספות שיתקבלו כתשובה נכונה <small>(מפרידים בפסיק)</small>
          <input dir="ltr" value={form.altTerms} onChange={set('altTerms')} />
        </label>
      </details>

      <div className="row">
        <button className="btn" type="submit">{wordId ? 'שמירה' : 'שמירה והוספת עוד'}</button>
        {!wordId && (
          <button className="btn secondary" type="button" onClick={() => save(false)}>שמירה וסיום</button>
        )}
      </div>

      {wordId && (
        <div className="danger-zone">
          {existing?.known && <p className="known-note">✅ המילה מסומנת כמוכרת – היא לא מופיעה בלמידה ובחזרות.</p>}
          {progress && (
            <p className="muted">
              נלמדה ב-{new Date(progress.learnedAt).toLocaleDateString('he-IL')} · חזרה הבאה:{' '}
              {new Date(progress.due).toLocaleDateString('he-IL')} · טעויות: {progress.lapses}
            </p>
          )}
          <div className="row">
            <button type="button" className="btn secondary" onClick={() => setKnown(wordId, !existing?.known)}>
              {existing?.known ? '↩ החזר ללמידה' : '✓ אני כבר מכיר'}
            </button>
            {progress && <button type="button" className="btn secondary" onClick={resetProgress}>איפוס התקדמות</button>}
            <button type="button" className="btn danger" onClick={remove}>מחיקה</button>
          </div>
        </div>
      )}
    </form>
  )
}
