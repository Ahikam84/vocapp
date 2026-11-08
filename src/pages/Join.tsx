import { GraduationCap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { langName, t } from '../lib/i18n'
import { setSetting } from '../lib/settings'
import { fetchSharedCourse, joinSharedCourse, type SharedCourse } from '../lib/sharing'

/** Landing page of a teacher's share link: shows the course and adds it. */
export default function Join() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState<SharedCourse | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchSharedCourse(code)
      .then(setCourse)
      .catch((e) => setError(e instanceof Error ? e.message : String(e?.message ?? e)))
  }, [code])

  async function add() {
    if (!course) return
    setBusy(true)
    try {
      const { deckId } = await joinSharedCourse(course)
      await setSetting('currentDeckId', deckId)
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
  if (course === undefined) return <div className="page center-page muted">{t('טוען…')}</div>
  if (course === null)
    return (
      <div className="page center-page">
        <p>{t('לא נמצא קורס עם הקוד {code}. בדוק את הקוד עם המורה.', { code })}</p>
        <Link className="btn secondary" to="/courses">{t('לקורסים')}</Link>
      </div>
    )

  return (
    <div className="page center-page">
      <div className="celebrate"><GraduationCap size={40} /></div>
      <h1 dir="auto">{course.name}</h1>
      <p className="muted">
        {t('{target} · תרגומים ב{source} · {n} מילים', {
          target: langName(course.targetLang), source: langName(course.sourceLang), n: course.words.length,
        })}
      </p>
      <button className="btn big" disabled={busy} onClick={add}>{t('הוספת הקורס')}</button>
    </div>
  )
}
