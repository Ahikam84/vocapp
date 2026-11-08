import { ChevronLeft, CircleCheck, Copy, RefreshCw, Share2, Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { COURSES } from '../courses'
import type { CourseInfo } from '../courses/types'
import { addCourse, courseDeckId } from '../lib/courses'
import { db, deleteDeck, newId, type Deck } from '../lib/db'
import { LEARNABLE, langName, t, uiLang } from '../lib/i18n'
import { setSetting } from '../lib/settings'
import { fetchSharedCourse, joinSharedCourse, publishDeck, shareLink } from '../lib/sharing'

/** Step 1: pick a language. Step 2 (/courses/:lang): that language's courses. */
export default function Courses({ deck }: { deck: Deck | null }) {
  const { lang } = useParams()
  return lang ? <LanguageCourses lang={lang} current={deck} /> : <LanguagePicker hasCourse={!!deck} />
}

function LanguagePicker({ hasCourse }: { hasCourse: boolean }) {
  const decks = useLiveQuery(() => db.decks.toArray())
  if (!decks) return null
  const mine = (lang: string) => decks.filter((d) => d.targetLang === lang).length
  // Languages the user already studies come first.
  const langs = [...LEARNABLE].sort((a, b) => Number(mine(b) > 0) - Number(mine(a) > 0))

  return (
    <div className="page">
      <h1>{hasCourse ? t('קורסים') : t('מה אתה רוצה ללמוד?')}</h1>
      {!hasCourse && <p className="muted">{t('בחר שפה, ואחר כך קורס מוכן, קורס שקיבלת ממורה, או קורס חדש משלך.')}</p>}
      <ul className="lang-list">
        {langs.map((code) => {
          const count = mine(code)
          const ready = COURSES.filter((c) => c.targetLang === code).length
          return (
            <li key={code}>
              <Link to={`/courses/${code}`}>
                <span className="grow">
                  <b>{langName(code)}</b>
                  <span className="muted">
                    {count ? t('{n} קורסים שלך', { n: count }) : ready ? t('{n} קורסים מוכנים', { n: ready }) : ''}
                  </span>
                </span>
                <ChevronLeft className="flip" size={20} />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function LanguageCourses({ lang, current }: { lang: string; current: Deck | null }) {
  const navigate = useNavigate()
  const data = useLiveQuery(async () => {
    const decks = (await db.decks.toArray()).sort((a, b) => a.createdAt - b.createdAt).filter((d) => d.targetLang === lang)
    const counts = Object.fromEntries(
      await Promise.all(decks.map(async (d) => [d.id, await db.words.where('deckId').equals(d.id).count()] as const)),
    )
    return { decks, counts }
  }, [lang])
  if (!data) return null

  async function choose(deckId: string) {
    await setSetting('currentDeckId', deckId)
    navigate('/')
  }

  const ready = COURSES.filter((c) => c.targetLang === lang)
  return (
    <div className="page form">
      <Link to="/courses" className="back"><ChevronLeft className="flip-back" size={18} /> {t('כל השפות')}</Link>
      <h1>{langName(lang)}</h1>

      {data.decks.length > 0 && (
        <>
          <h2>{t('הקורסים שלי')}</h2>
          <ul className="course-list">
            {data.decks.map((d) => (
              <MyCourse key={d.id} deck={d} count={data.counts[d.id] ?? 0} isCurrent={d.id === current?.id} onChoose={() => choose(d.id)} />
            ))}
          </ul>
        </>
      )}

      {ready.length > 0 && (
        <>
          <h2>{t('קורסים מוכנים')}</h2>
          <ul className="course-list">
            {ready.map((c) => (
              <ReadyCourse key={c.id} course={c} have={data.counts[courseDeckId(c.id)] ?? 0} onChoose={choose} />
            ))}
          </ul>
        </>
      )}

      <JoinByCode />
      <NewCourse lang={lang} onCreated={choose} />
    </div>
  )
}

function MyCourse({ deck, count, isCurrent, onChoose }: { deck: Deck; count: number; isCurrent: boolean; onChoose: () => void }) {
  const [sharing, setSharing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const isReady = deck.id.startsWith('course-')

  async function run(fn: () => Promise<string>) {
    setBusy(true)
    setMsg(null)
    try {
      setMsg({ ok: true, text: await fn() })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }

  const publish = () =>
    run(async () => {
      await publishDeck(deck)
      return deck.shareCode ? t('הגרסה המשותפת עודכנה – התלמידים יקבלו את השינויים ב"בדיקת עדכונים".') : t('הקורס משותף. שלח לתלמידים את הקישור.')
    })

  const pullUpdates = () =>
    run(async () => {
      const course = await fetchSharedCourse(deck.sharedFrom!)
      if (!course) throw new Error(t('המורה הפסיק לשתף את הקורס הזה.'))
      const { added, updated } = await joinSharedCourse(course)
      return added || updated ? t('נוספו {added} מילים, עודכנו {updated}.', { added, updated }) : t('הקורס מעודכן.')
    })

  async function remove() {
    if (confirm(t('למחוק את הקורס "{name}" עם כל המילים וההתקדמות? אי אפשר לבטל.', { name: deck.name }))) await deleteDeck(deck.id)
  }

  return (
    <li className={isCurrent ? 'current' : ''}>
      <div className="row between">
        <div className="grow">
          <b>{deck.name}</b>
          <div className="muted">
            {t('{n} מילים', { n: count })}
            {deck.sharedFrom && ` · ${t('מהמורה')}`}
            {deck.shareCode && ` · ${t('משותף')}`}
          </div>
        </div>
        {isCurrent ? (
          <span className="current-mark"><CircleCheck size={18} /> {t('נוכחי')}</span>
        ) : (
          <button className="btn small" onClick={onChoose}>{t('בחירה')}</button>
        )}
      </div>
      <div className="row course-actions">
        {!deck.sharedFrom && !isReady && (
          <button className="link-btn" onClick={() => setSharing(!sharing)}><Share2 size={14} /> {t('שיתוף עם תלמידים')}</button>
        )}
        {deck.sharedFrom && (
          <button className="link-btn" disabled={busy} onClick={pullUpdates}><RefreshCw size={14} /> {t('בדיקת עדכונים')}</button>
        )}
        <button className="link-btn danger-link" onClick={remove}><Trash2 size={14} /> {t('מחיקה')}</button>
      </div>
      {sharing && (
        <div className="share-panel">
          {deck.shareCode ? (
            <>
              <p className="muted">{t('תלמידים פותחים את הקישור (או מקלידים את הקוד במסך הקורסים) ומקבלים עותק משלהם.')}</p>
              <div className="share-link">
                <input readOnly dir="ltr" value={shareLink(deck.shareCode)} onFocus={(e) => e.target.select()} />
                <button className="btn secondary small" onClick={() => navigator.clipboard.writeText(shareLink(deck.shareCode!))}>
                  <Copy size={16} /> {t('העתקה')}
                </button>
              </div>
              <p className="muted">{t('קוד:')} <b dir="ltr" className="code">{deck.shareCode}</b></p>
              <button className="btn secondary small" disabled={busy} onClick={publish}>{t('עדכון הגרסה המשותפת')}</button>
            </>
          ) : (
            <>
              <p className="muted">{t('השיתוף יוצר קישור. כל מי שיש לו את הקישור יכול להוסיף את הקורס. שינויים שתעשה אחר כך יגיעו לתלמידים אחרי "עדכון הגרסה המשותפת".')}</p>
              <button className="btn small" disabled={busy} onClick={publish}><Share2 size={16} /> {t('יצירת קישור שיתוף')}</button>
            </>
          )}
        </div>
      )}
      {msg && <div className={msg.ok ? 'toast' : 'warn'}>{msg.text}</div>}
    </li>
  )
}

function ReadyCourse({ course, have, onChoose }: { course: CourseInfo; have: number; onChoose: (deckId: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function add() {
    setBusy(true)
    try {
      const { deckId, added } = await addCourse(course)
      if (!have) return onChoose(deckId)
      setMsg(added ? t('נוספו {n} מילים.', { n: added }) : t('הקורס מעודכן – אין מילים חדשות.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <div className="row between">
        <div className="grow">
          <b>{course.name}</b> <span className="badge level">{course.level}</span>
          <div className="muted">{course.description}</div>
          {have > 0 && <div className="muted">{t('נוסף · {n} מילים', { n: have })}</div>}
        </div>
        <button className={have ? 'btn secondary small' : 'btn small'} disabled={busy} onClick={add}>
          {busy ? t('מוסיף…') : have ? t('בדיקת עדכונים') : t('הוספה')}
        </button>
      </div>
      {msg && <div className="toast">{msg}</div>}
    </li>
  )
}

function JoinByCode() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  return (
    <>
      <h2>{t('קיבלת קוד ממורה?')}</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) navigate(`/join/${code.trim().toUpperCase()}`)
        }}
      >
        <input dir="ltr" className="code-input" placeholder="ABC123" value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} />
        <button className="btn secondary">{t('הצטרפות')}</button>
      </form>
    </>
  )
}

function NewCourse({ lang, onCreated }: { lang: string; onCreated: (deckId: string) => void }) {
  const [name, setName] = useState('')
  // Translations default to the UI language, unless that is the language being learned.
  const [sourceLang, setSourceLang] = useState<string>(uiLang() === lang ? (lang === 'he' ? 'en' : 'he') : uiLang())

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const id = newId()
    await db.decks.add({ id, name: name.trim(), sourceLang, targetLang: lang, createdAt: Date.now() })
    onCreated(id)
  }

  return (
    <>
      <h2>{t('קורס חדש משלך')}</h2>
      <form onSubmit={create}>
        <label>
          {t('שם הקורס')}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('למשל: פרק 3 – משפחה')} required />
        </label>
        <label>
          {t('שפת התרגומים')}
          <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
            {LEARNABLE.filter((l) => l !== lang).map((l) => (
              <option key={l} value={l}>{langName(l)}</option>
            ))}
          </select>
        </label>
        <button className="btn">{t('יצירת קורס')}</button>
      </form>
    </>
  )
}
