import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plant, SpeakButton, T } from '../components/common'
import { db, type Deck } from '../lib/db'
import { DIFFICULT_LAPSES, strength } from '../lib/srs'
import { normalize, stripAccents } from '../lib/answer'

type Filter = 'all' | 'new' | 'learned' | 'difficult'

export default function Words({ deck }: { deck: Deck }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

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
    if (filter === 'new' && p) return false
    if (filter === 'learned' && !p) return false
    if (filter === 'difficult' && !(p && p.lapses >= DIFFICULT_LAPSES)) return false
    if (!q) return true
    return [w.term, ...w.translations].some((s) => stripAccents(normalize(s)).includes(q))
  })

  return (
    <div className="page">
      <div className="row between">
        <h1>המילים שלי ({data.words.length})</h1>
        <div className="row">
          <Link className="btn secondary" to="/import">ייבוא</Link>
          <Link className="btn" to="/words/new">+ מילה</Link>
        </div>
      </div>

      <input className="search" placeholder="חיפוש…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips">
        {(
          [
            ['all', 'הכל'],
            ['new', 'חדשות'],
            ['learned', 'נלמדו'],
            ['difficult', 'קשות'],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button key={key} className={filter === key ? 'chip active' : 'chip'} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      {data.words.length === 0 && (
        <p className="empty">
          אין עדיין מילים. <Link to="/words/new">הוסף מילה</Link> או <Link to="/import">ייבא רשימה</Link>.
        </p>
      )}

      <ul className="word-list">
        {rows.map((w) => {
          const p = data.progress.get(w.id)
          return (
            <li key={w.id} onClick={() => navigate(`/words/${w.id}`)}>
              <Plant level={strength(p)} />
              <div className="grow">
                <T className="term">{w.term}</T>
                <div className="muted">{w.translations.join(', ')}</div>
              </div>
              {p && p.lapses >= DIFFICULT_LAPSES && <span className="badge">קשה</span>}
              <SpeakButton text={w.term} lang={deck.targetLang} small />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
