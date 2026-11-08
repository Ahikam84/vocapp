import { Circle, CircleCheck, Lightbulb, Volume2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, importData, newId, type Deck } from '../lib/db'
import { setSetting, useSettings } from '../lib/settings'
import { ReadyCourses } from '../components/ReadyCourses'
import { SyncSection } from '../components/SyncSection'
import { setTtsPreferences, speak, useVoices } from '../lib/tts'
import { LANGUAGES } from '../lib/useDeck'

const SAMPLES: Record<string, string> = {
  es: 'Hola, ¿qué tal? Me gusta aprender español.',
  ca: "Hola, com estàs? M'agrada aprendre català.",
  fr: "Bonjour, comment ça va ? J'aime apprendre le français.",
  en: 'Hello, how are you? I enjoy learning English.',
}

export default function SettingsPage({ deck }: { deck: Deck }) {
  const settings = useSettings()
  const decks = useLiveQuery(() => db.decks.toArray())
  const [newDeck, setNewDeck] = useState({ name: '', targetLang: 'ca' })
  const [msg, setMsg] = useState<string | null>(null)
  const voices = useVoices(deck.targetLang)
  if (!settings || !decks) return null

  const lang = deck.targetLang
  const sample = SAMPLES[lang] ?? 'Hola'
  // Apply immediately so the preview uses the new choice before the setting round-trips through the DB.
  async function chooseVoice(voiceURI: string) {
    const next = { ...settings!.voices }
    if (voiceURI) next[lang] = voiceURI
    else delete next[lang]
    setTtsPreferences(next, settings!.speechRate)
    await setSetting('voices', next)
    speak(sample, lang)
  }
  async function chooseRate(rate: number) {
    setTtsPreferences(settings!.voices, rate)
    await setSetting('speechRate', rate)
  }

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
    const id = await db.decks.add({ id: newId(), name: newDeck.name.trim(), sourceLang: 'he', targetLang: newDeck.targetLang, createdAt: Date.now() })
    await setSetting('currentDeckId', id)
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
    if (!confirm('הנתונים מהגיבוי יתווספו לנתונים הקיימים (מילים זהות יתעדכנו). להמשיך?')) return
    await importData(data)
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

      <h2>הקראה ({LANGUAGES[lang] ?? lang})</h2>
      {voices.length === 0 ? (
        <p className="muted">לא נמצאו קולות לשפה הזו בדפדפן. נסה את Edge או Chrome.</p>
      ) : (
        <>
          <label>
            קול
            <div className="row">
              <select value={settings.voices[lang] ?? ''} onChange={(e) => chooseVoice(e.target.value)}>
                <option value="">אוטומטי – {voices[0].name}</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn secondary" onClick={() => speak(sample, lang)}><Volume2 size={18} /> השמעה</button>
            </div>
          </label>
          <label className="inline">
            מהירות: {settings.speechRate.toFixed(2)}
            <input
              type="range"
              min={0.6}
              max={1.2}
              step={0.05}
              value={settings.speechRate}
              onChange={(e) => chooseRate(Number(e.target.value))}
              onMouseUp={() => speak(sample, lang)}
              onTouchEnd={() => speak(sample, lang)}
            />
          </label>
          {!voices.some((v) => /natural|neural|online|google|premium|enhanced/i.test(v.name)) && (
            <p className="tip">
              <Lightbulb size={16} /> הקולות כאן בסיסיים. ב-Microsoft Edge יש קולות "Natural" טבעיים יותר, וב-Chrome יש קול של Google.
            </p>
          )}
        </>
      )}

      <ReadyCourses />

      <h2>הקורסים שלי</h2>
      <ul className="deck-list">
        {decks.map((d) => (
          <li key={d.id} className={d.id === deck.id ? 'active' : ''} onClick={() => setSetting('currentDeckId', d.id)}>
            {d.id === deck.id ? <CircleCheck size={18} /> : <Circle size={18} />} {d.name} <span className="muted">({LANGUAGES[d.targetLang] ?? d.targetLang})</span>
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

      <SyncSection />

      <h2>גיבוי</h2>
      <p className="muted">קובץ גיבוי מאפשר לשמור עותק של כל המילים וההתקדמות, גם בלי סנכרון.</p>
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
