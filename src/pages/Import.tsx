import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { T } from '../components/common'
import { db, newId, type Deck } from '../lib/db'
import { normalize } from '../lib/answer'
import { parseWordList } from '../lib/importText'

const SAMPLE = `hola - שלום
gracias - תודה
el perro - כלב
la casa - בית/דירה
comer - לאכול
el agua - מים`

export default function Import({ deck }: { deck: Deck }) {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [skipped, setSkipped] = useState<number | null>(null)
  const parsed = useMemo(() => parseWordList(text), [text])

  async function readFile(file: File) {
    setText(await file.text())
  }

  async function doImport() {
    const existing = new Set((await db.words.where('deckId').equals(deck.id).toArray()).map((w) => normalize(w.term)))
    const now = Date.now()
    const fresh = parsed.filter((p) => {
      const key = normalize(p.term)
      if (existing.has(key)) return false
      existing.add(key)
      return true
    })
    await db.words.bulkAdd(fresh.map((p, i) => ({ ...p, id: newId(), deckId: deck.id, createdAt: now + i })))
    setSkipped(parsed.length - fresh.length)
    if (parsed.length === fresh.length) navigate('/words')
  }

  return (
    <div className="page form">
      <h1>ייבוא רשימת מילים</h1>
      <p className="muted">
        שורה לכל מילה: <code>מילה - תרגום</code>. אפשר להפריד גם בטאב, בנקודה-פסיק או בפסיק (CSV). כמה תרגומים מפרידים
        ב-<code>/</code>. עמודות נוספות (לא חובה): משפט לדוגמה, תרגום המשפט, רמז.
      </p>

      <textarea dir="auto" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} />
      <div className="row">
        <label className="btn secondary">
          בחירת קובץ CSV / TXT
          <input type="file" accept=".csv,.txt,.tsv" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
        </label>
        {!text && <button className="btn secondary" onClick={() => setText(SAMPLE)}>טען דוגמה</button>}
      </div>

      {skipped !== null && <div className="toast">יובאו {parsed.length - skipped} מילים, {skipped} כפילויות דולגו.</div>}

      {parsed.length > 0 && (
        <>
          <h2>תצוגה מקדימה ({parsed.length})</h2>
          <table className="preview">
            <tbody>
              {parsed.slice(0, 50).map((p, i) => (
                <tr key={i}>
                  <td><T>{p.term}</T></td>
                  <td>{p.translations.join(', ')}</td>
                  <td className="muted">{p.example && <T>{p.example}</T>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn" onClick={doImport}>ייבוא {parsed.length} מילים</button>
        </>
      )}
    </div>
  )
}
