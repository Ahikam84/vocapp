import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, reviveCard, type Deck } from '../lib/db'
import { setSetting, useSettings } from '../lib/settings'
import { LANGUAGES } from '../lib/useDeck'

export default function SettingsPage({ deck }: { deck: Deck }) {
  const settings = useSettings()
  const decks = useLiveQuery(() => db.decks.toArray())
  const [newDeck, setNewDeck] = useState({ name: '', targetLang: 'ca' })
  const [msg, setMsg] = useState<string | null>(null)
  if (!settings || !decks) return null

  const num = (key: 'wordsPerSession' | 'newPerDay' | 'reviewsPerSession', min: number, max: number) => (
    <input
      type="number"
      min={min}
      max={max}
      value={settings[key]}
      onChange={(e) => setSetting(key, Math.max(min, Math.min(max, Number(e.target.value) || min)))}
    />
  )

  async function addDeck() {
    if (!newDeck.name.trim()) return
    const id = await db.decks.add({ name: newDeck.name.trim(), sourceLang: 'he', targetLang: newDeck.targetLang, createdAt: Date.now() })
    await setSetting('currentDeckId', id as number)
    setNewDeck({ name: '', targetLang: 'ca' })
  }

  async function exportBackup() {
    const data = {
      app: 'vocapp',
      version: 1,
      exportedAt: new Date().toISOString(),
      decks: await db.decks.toArray(),
      words: await db.words.toArray(),
      progress: await db.progress.toArray(),
      reviews: await db.reviews.toArray(),
      settings: await db.settings.toArray(),
    }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vocapp-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importBackup(file: File) {
    const data = JSON.parse(await file.text())
    if (data.app !== 'vocapp') return setMsg('הקובץ אינו גיבוי של VocApp')
    if (!confirm('שחזור הגיבוי יחליף את כל הנתונים הנוכחיים. להמשיך?')) return
    await db.transaction('rw', [db.decks, db.words, db.progress, db.reviews, db.settings], async () => {
      await Promise.all([db.decks.clear(), db.words.clear(), db.progress.clear(), db.reviews.clear(), db.settings.clear()])
      await db.decks.bulkAdd(data.decks)
      await db.words.bulkAdd(data.words)
      await db.progress.bulkAdd(data.progress.map((p: { card: never }) => ({ ...p, card: reviveCard(p.card) })))
      await db.reviews.bulkAdd(data.reviews)
      await db.settings.bulkAdd(data.settings)
    })
    setMsg(`שוחזרו ${data.words.length} מילים`)
  }

  return (
    <div className="page form">
      <h1>הגדרות</h1>

      <h2>למידה</h2>
      <label className="inline">מילים חדשות בכל סשן {num('wordsPerSession', 1, 20)}</label>
      <label className="inline">מקסימום מילים חדשות ביום {num('newPerDay', 1, 100)}</label>
      <label className="inline">מקסימום חזרות בסשן {num('reviewsPerSession', 5, 200)}</label>
      <label className="inline">
        השמעה אוטומטית של המילים
        <input type="checkbox" checked={settings.autoPlayAudio} onChange={(e) => setSetting('autoPlayAudio', e.target.checked)} />
      </label>

      <h2>קורסים</h2>
      <ul className="deck-list">
        {decks.map((d) => (
          <li key={d.id} className={d.id === deck.id ? 'active' : ''} onClick={() => setSetting('currentDeckId', d.id)}>
            {d.id === deck.id ? '●' : '○'} {d.name} <span className="muted">({LANGUAGES[d.targetLang] ?? d.targetLang})</span>
          </li>
        ))}
      </ul>
      <div className="row">
        <input placeholder="שם קורס חדש" value={newDeck.name} onChange={(e) => setNewDeck({ ...newDeck, name: e.target.value })} />
        <select value={newDeck.targetLang} onChange={(e) => setNewDeck({ ...newDeck, targetLang: e.target.value })}>
          {Object.entries(LANGUAGES)
            .filter(([code]) => code !== 'he')
            .map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
        </select>
        <button className="btn secondary" onClick={addDeck}>הוספה</button>
      </div>

      <h2>גיבוי</h2>
      <p className="muted">הנתונים נשמרים רק בדפדפן הזה. מומלץ לגבות מדי פעם.</p>
      <div className="row">
        <button className="btn secondary" onClick={exportBackup}>ייצוא גיבוי</button>
        <label className="btn secondary">
          שחזור מגיבוי
          <input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
        </label>
      </div>
      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}
