import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CourseSelect, T } from '../components/common'
import { db, newId } from '../lib/db'
import { normalize } from '../lib/answer'
import { t } from '../lib/i18n'
import { parseWordList } from '../lib/importText'
import type { Study } from '../lib/useDeck'

/** Example list per course language, in that course's word – translation order. */
const SAMPLES: Record<string, string> = {
  es: `hola - שלום\ngracias - תודה\nel perro - כלב\nla casa - בית/דירה`,
  he: `שלום - hello/hi\nתודה - thank you\nכלב - dog\nבית - house/home`,
}

export default function Import({ study }: { study: Study }) {
  const { deck } = study
  const navigate = useNavigate()
  // Arriving right after creating a course: import into it (the study may not have switched yet).
  const createdDeckId = (useLocation().state as { createdDeckId?: string } | null)?.createdDeckId
  const [targetDeckId, setTargetDeckId] = useState(createdDeckId ?? deck.id)
  const [text, setText] = useState('')
  const [skipped, setSkipped] = useState<number | null>(null)
  const parsed = useMemo(() => parseWordList(text, deck.targetLang), [text, deck.targetLang])
  const sample = SAMPLES[deck.targetLang] ?? 'word - translation'

  async function readFile(file: File) {
    setText(await file.text())
  }

  async function doImport() {
    const existing = new Set((await db.words.where('deckId').equals(targetDeckId).toArray()).map((w) => normalize(w.term)))
    const now = Date.now()
    const fresh = parsed.filter((p) => {
      const key = normalize(p.term)
      if (existing.has(key)) return false
      existing.add(key)
      return true
    })
    await db.words.bulkAdd(fresh.map((p, i) => ({ ...p, id: newId(), deckId: targetDeckId, createdAt: now + i })))
    setSkipped(parsed.length - fresh.length)
    if (parsed.length === fresh.length) navigate('/words')
  }

  return (
    <div className="page form">
      {createdDeckId && (
        <div className="toast">
          <span className="grow">{t('הקורס נוצר! עכשיו מוסיפים לו מילים: מדביקים כאן רשימה, או מוסיפים אותן אחת-אחת.')}</span>
          <Link className="btn secondary small" to="/words/new">{t('הוספת מילה')}</Link>
        </div>
      )}
      <h1>{t('ייבוא רשימת מילים')}</h1>
      <p className="muted">
        {t('שורה לכל מילה:')} <code>{t('מילה - תרגום')}</code>.{' '}
        {t('אפשר להפריד גם בטאב, בנקודה-פסיק או בפסיק (CSV). כמה תרגומים מפרידים ב-/. עמודות נוספות (לא חובה): משפט לדוגמה, תרגום המשפט, רמז.')}
      </p>

      <CourseSelect decks={study.decks} value={targetDeckId} onChange={setTargetDeckId} />
      <textarea dir="auto" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={sample} />
      <div className="row">
        <label className="btn secondary">
          {t('בחירת קובץ CSV / TXT')}
          <input type="file" accept=".csv,.txt,.tsv" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
        </label>
        {!text && SAMPLES[deck.targetLang] && <button className="btn secondary" onClick={() => setText(sample)}>{t('טען דוגמה')}</button>}
      </div>

      {skipped !== null && <div className="toast">{t('יובאו {n} מילים, {skipped} כפילויות דולגו.', { n: parsed.length - skipped, skipped })}</div>}

      {parsed.length > 0 && (
        <>
          <h2>{t('תצוגה מקדימה ({n})', { n: parsed.length })}</h2>
          <table className="preview">
            <tbody>
              {parsed.slice(0, 50).map((p, i) => (
                <tr key={i}>
                  <td><T>{p.term}</T></td>
                  <td><T>{p.translations.join(', ')}</T></td>
                  <td className="muted">{p.example && <T>{p.example}</T>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn" onClick={doImport}>{t('ייבוא {n} מילים', { n: parsed.length })}</button>
        </>
      )}
    </div>
  )
}
