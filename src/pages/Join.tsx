import { CircleCheck, GraduationCap } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../lib/db'
import { langName, t } from '../lib/i18n'
import { setSetting } from '../lib/settings'
import { fetchSharedCourse, joinSharedCourse, sharedDeckId, type SharedCourse } from '../lib/sharing'

/**
 * Landing page of a teacher's share link. The link can carry one code or
 * several separated by commas, so a whole set of courses arrives in one go.
 */
export default function Join() {
  const { code = '' } = useParams()
  const codes = [...new Set(code.toUpperCase().split(',').map((c) => c.trim()).filter(Boolean))]
  const navigate = useNavigate()
  const [found, setFound] = useState<SharedCourse[] | undefined>(undefined)
  const [missing, setMissing] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const existing = useLiveQuery(async () => new Set((await db.decks.toArray()).map((d) => d.id)))

  useEffect(() => {
    Promise.all(codes.map((c) => fetchSharedCourse(c)))
      .then((results) => {
        setFound(results.filter((r): r is SharedCourse => !!r))
        setMissing(codes.filter((_, i) => !results[i]))
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e?.message ?? e)))
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addAll() {
    if (!found?.length) return
    setBusy(true)
    try {
      let first: string | undefined
      for (const course of found) {
        const { deckId } = await joinSharedCourse(course)
        first ??= deckId
      }
      await setSetting('currentDeckId', first!)
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  if (error)
    return (
      <div className="page center-page">
        <p className="warn">{error}</p>
        <Link className="btn secondary" to="/courses">{t('לקורסים')}</Link>
      </div>
    )
  if (found === undefined || !existing) return <div className="page center-page muted">{t('טוען…')}</div>
  if (found.length === 0)
    return (
      <div className="page center-page">
        <p>{t('לא נמצא קורס עם הקוד {code}. בדוק את הקוד עם המורה.', { code: codes.join(', ') })}</p>
        <Link className="btn secondary" to="/courses">{t('לקורסים')}</Link>
      </div>
    )

  const allAdded = found.every((c) => existing.has(sharedDeckId(c.code)))
  return (
    <div className="page center-page">
      <div className="celebrate"><GraduationCap size={40} /></div>
      {found.length === 1 ? (
        <>
          <h1 dir="auto">{found[0].name}</h1>
          <p className="muted">
            {t('{target} · תרגומים ב{source} · {n} מילים', {
              target: langName(found[0].targetLang), source: langName(found[0].sourceLang), n: found[0].words.length,
            })}
          </p>
        </>
      ) : (
        <>
          <h1>{t('{n} קורסים מהמורה', { n: found.length })}</h1>
          <ul className="join-list">
            {found.map((c) => (
              <li key={c.code}>
                <span className="grow">
                  <b dir="auto">{c.name}</b>
                  <span className="muted">{t('{target} · {n} מילים', { target: langName(c.targetLang), n: c.words.length })}</span>
                </span>
                {existing.has(sharedDeckId(c.code)) && <CircleCheck size={18} className="added" aria-label={t('כבר נוסף')} />}
              </li>
            ))}
          </ul>
        </>
      )}
      {missing.length > 0 && <p className="warn">{t('הקודים האלה לא נמצאו: {codes}', { codes: missing.join(', ') })}</p>}
      <button className="btn big" disabled={busy} onClick={addAll}>
        {allAdded ? t('עדכון הקורסים') : found.length === 1 ? t('הוספת הקורס') : t('הוספת כל הקורסים')}
      </button>
    </div>
  )
}
