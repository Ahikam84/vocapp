import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { COURSES } from '../courses'
import type { CourseInfo } from '../courses/types'
import { db } from '../lib/db'
import { addCourse, courseDeckId } from '../lib/courses'
import { setSetting } from '../lib/settings'

export function ReadyCourses() {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null)
  const location = useLocation()
  useEffect(() => {
    if (location.hash === '#ready-courses') document.getElementById('ready-courses')?.scrollIntoView()
  }, [location.hash])
  const counts = useLiveQuery(async () =>
    Object.fromEntries(
      await Promise.all(COURSES.map(async (c) => [c.id, await db.words.where('deckId').equals(courseDeckId(c.id)).count()])),
    ),
  )

  async function add(course: CourseInfo) {
    setBusy(course.id)
    try {
      const { deckId, added } = await addCourse(course)
      await setSetting('currentDeckId', deckId)
      setMsg({ id: course.id, text: added ? `נוספו ${added} מילים. הקורס נבחר כקורס הנוכחי.` : 'הקורס מעודכן – אין מילים חדשות.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <h2 id="ready-courses">קורסים מוכנים</h2>
      <ul className="course-list">
        {COURSES.map((c) => {
          const have = counts?.[c.id] ?? 0
          return (
            <li key={c.id}>
              <div className="row between">
                <div className="grow">
                  <b>{c.name}</b> <span className="badge level">{c.level}</span>
                  <div className="muted">{c.description}</div>
                  {have > 0 && <div className="muted">✓ נוסף · {have} מילים</div>}
                </div>
                <button className={have ? 'btn secondary' : 'btn'} disabled={busy === c.id} onClick={() => add(c)}>
                  {busy === c.id ? 'מוסיף…' : have ? 'בדיקת עדכונים' : 'הוספה'}
                </button>
              </div>
              {msg?.id === c.id && (
                <div className="toast">
                  {msg.text} <Link to="/">להתחיל ללמוד ←</Link>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
