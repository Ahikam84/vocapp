import { ChevronLeft } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { COURSES } from '../courses'
import { courseDeckId } from '../lib/courses'
import { db, type Deck } from '../lib/db'
import { langName, t } from '../lib/i18n'
import { setSetting } from '../lib/settings'
import type { Study } from '../lib/useDeck'

/**
 * Choose what to practise: tick several courses of the current language to
 * study them together, or jump to a course in another language.
 */
export default function StudyPicker({ study }: { study: Study }) {
  const navigate = useNavigate()
  const data = useLiveQuery(async () => {
    const decks = (await db.decks.toArray()).sort((a, b) => courseOrder(a) - courseOrder(b) || a.createdAt - b.createdAt)
    const counts = Object.fromEntries(
      await Promise.all(decks.map(async (d) => [d.id, await db.words.where('deckId').equals(d.id).count()] as const)),
    )
    return { decks, counts }
  })
  if (!data) return null

  const lang = study.deck.targetLang
  const sameLang = data.decks.filter((d) => d.targetLang === lang)
  // The other languages, each under its own heading.
  const others = new Map<string, Deck[]>()
  for (const d of data.decks) if (d.targetLang !== lang) others.set(d.targetLang, [...(others.get(d.targetLang) ?? []), d])
  const selected = new Set(study.deckIds)

  async function apply(ids: string[]) {
    // Keep the main course if it's still selected, otherwise the first selected one takes over.
    const main = ids.includes(study.deck.id) ? study.deck.id : ids[0]
    await setSetting('currentDeckId', main)
    await setSetting('studyDeckIds', ids.length > 1 ? ids : [])
  }

  function toggle(d: Deck) {
    const ids = sameLang.filter((x) => (x.id === d.id ? !selected.has(x.id) : selected.has(x.id))).map((x) => x.id)
    if (ids.length) apply(ids)
  }

  async function only(d: Deck) {
    await apply([d.id])
    navigate('/')
  }

  return (
    <div className="page form">
      <h1>{t('מה לתרגל?')}</h1>
      {sameLang.length > 1 && <p className="muted">{t('אפשר לסמן כמה קורסים באותה שפה – הלמידה, החזרות והסטטיסטיקה יכללו את כולם.')}</p>}

      <h2>{langName(lang)}</h2>
      <ul className="pick-list">
        {sameLang.map((d) => (
          <li key={d.id} className={selected.has(d.id) ? 'on' : ''}>
            <label className="pick-main">
              <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d)} disabled={selected.has(d.id) && selected.size === 1} />
              <span className="grow">
                <b dir="auto">{d.name}</b>
                <span className="muted">{t('{n} מילים', { n: data.counts[d.id] ?? 0 })}</span>
              </span>
            </label>
            {sameLang.length > 1 && !(selected.size === 1 && selected.has(d.id)) && (
              <button className="link-btn" onClick={() => only(d)}>{t('רק את הקורס הזה')}</button>
            )}
          </li>
        ))}
      </ul>
      <div className="row">
        <button className="btn" onClick={() => navigate('/')}>{t('סיום')}</button>
        {sameLang.length > 1 && selected.size < sameLang.length && (
          <button className="btn secondary" onClick={() => apply(sameLang.map((d) => d.id))}>{t('סימון הכל')}</button>
        )}
      </div>

      {others.size > 0 && (
        <>
          <h2>{t('בשפות אחרות')}</h2>
          {[...others].map(([code, decks]) => (
            <section key={code} className="lang-group">
              <h3>{langName(code)}</h3>
              <ul className="lang-list">
                {decks.map((d) => (
                  <li key={d.id}>
                    <a href="#" onClick={(e) => { e.preventDefault(); only(d) }}>
                      <span className="grow">
                        <b dir="auto">{d.name}</b>
                        <span className="muted">{t('{n} מילים', { n: data.counts[d.id] ?? 0 })}</span>
                      </span>
                      <ChevronLeft className="flip" size={20} />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <p className="muted center-text"><Link to="/courses">{t('לעוד קורסים ושפות')}</Link></p>
    </div>
  )
}

/** Ready-made courses in their level order (beginners first); the user's own decks after them. */
function courseOrder(d: Deck) {
  const i = COURSES.findIndex((c) => courseDeckId(c.id) === d.id)
  return i < 0 ? COURSES.length : i
}
