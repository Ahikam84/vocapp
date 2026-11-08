import { Check, Plus, Undo2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { SpeakButton, Strength, T } from '../components/common'
import { db, setKnown, type Deck } from '../lib/db'
import { t } from '../lib/i18n'
import { DIFFICULT_LAPSES, strength } from '../lib/srs'
import { normalize, stripAccents } from '../lib/answer'

type Filter = 'all' | 'new' | 'learned' | 'difficult' | 'known'

export default function Words({ deck }: { deck: Deck }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [params] = useSearchParams()
  const [filter, setFilter] = useState<Filter>((params.get('filter') as Filter) ?? 'all')

  const data = useLiveQuery(async () => {
    const [words, progress] = await Promise.all([
      db.words.where('deckId').equals(deck.id).reverse().sortBy('createdAt'),
      db.progress.where('deckId').equals(deck.id).toArray(),
    ])
    return { words, progress: new Map(progress.map((p) => [p.wordId, p])) }
  }, [deck.id])

  if (!data) return null
  const q = stripAccents(normalize(query))
  const rows = data.words.filter((w) => {
    const p = data.progress.get(w.id)
    if (filter === 'known') {
      if (!w.known) return false
    } else if (filter !== 'all') {
      if (w.known) return false
      if (filter === 'new' && p) return false
      if (filter === 'learned' && !p) return false
      if (filter === 'difficult' && !(p && p.lapses >= DIFFICULT_LAPSES)) return false
    }
    if (!q) return true
    return [w.term, ...w.translations].some((s) => stripAccents(normalize(s)).includes(q))
  })

  return (
    <div className="page">
      <div className="page-head">
        <h1>
          {t('המילים שלי')} <span className="head-count">{data.words.length}</span>
        </h1>
        <div className="row">
          <Link className="btn secondary small" to="/import">{t('ייבוא')}</Link>
          <Link className="btn small" to="/words/new"><Plus size={18} /> {t('מילה')}</Link>
        </div>
      </div>

      <input className="search" placeholder={t('חיפוש…')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips">
        {(
          [
            ['all', 'הכל'],
            ['new', 'חדשות'],
            ['learned', 'נלמדו'],
            ['difficult', 'קשות'],
            ['known', 'מוכרות'],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button key={key} className={filter === key ? 'chip active' : 'chip'} onClick={() => setFilter(key)}>
            {t(label)}
          </button>
        ))}
      </div>

      {data.words.length === 0 && (
        <p className="empty">
          {t('אין עדיין מילים.')} <Link to="/words/new">{t('הוספת מילה')}</Link> · <Link to="/import">{t('ייבוא רשימה')}</Link>
        </p>
      )}

      {filter === 'known' && rows.length === 0 && !q && (
        <p className="empty">{t('אין מילים מסומנות כמוכרות. אפשר לסמן מילה בכפתור "כבר מכיר" בזמן הלמידה.')}</p>
      )}

      <ul className="word-list">
        {rows.map((w) => {
          const p = data.progress.get(w.id)
          return (
            <li key={w.id} className={w.known ? 'known' : ''} onClick={() => navigate(`/words/${w.id}`)}>
              {w.known ? <span className="known-mark" title={t('מסומנת כמוכרת')}><Check size={18} /></span> : <Strength level={strength(p)} />}
              <div className="grow">
                <T className="term">{w.term}</T>
                <div className="muted"><T>{w.translations.join(', ')}</T></div>
              </div>
              {w.known ? (
                <button
                  className="link-btn"
                  title={t('החזרת המילה ללמידה')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setKnown(w.id, false)
                  }}
                >
                  <Undo2 size={14} /> {t('החזר ללמידה')}
                </button>
              ) : (
                p && p.lapses >= DIFFICULT_LAPSES && <span className="badge">{t('קשה')}</span>
              )}
              <SpeakButton text={w.term} lang={deck.targetLang} small />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
