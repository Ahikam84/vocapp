import { Lightbulb, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { db, importData, type Deck } from '../lib/db'
import { langName, t, type UiLang } from '../lib/i18n'
import { setSetting, useSettings } from '../lib/settings'
import { SyncSection } from '../components/SyncSection'
import { APP_VERSION } from '../lib/pwa'
import { setTtsPreferences, speak, useVoices } from '../lib/tts'

const SAMPLES: Record<string, string> = {
  es: 'Hola, ¿qué tal? Me gusta aprender español.',
  ca: "Hola, com estàs? M'agrada aprendre català.",
  fr: "Bonjour, comment ça va ? J'aime apprendre le français.",
  en: 'Hello, how are you? I enjoy learning English.',
  he: 'שלום, מה שלומך? אני אוהב ללמוד עברית.',
  it: 'Ciao, come stai? Mi piace imparare l’italiano.',
  de: 'Hallo, wie geht es dir? Ich lerne gern Deutsch.',
  pt: 'Olá, tudo bem? Gosto de aprender português.',
}

export default function SettingsPage({ deck }: { deck: Deck | null }) {
  const settings = useSettings()
  const [msg, setMsg] = useState<string | null>(null)
  if (!settings) return null

  const num = (key: 'wordsPerSession' | 'newPerDay' | 'reviewsPerSession', min: number, max: number) => (
    <input
      type="number"
      min={min}
      max={max}
      value={settings[key]}
      onChange={(e) => setSetting(key, Math.max(min, Math.min(max, Number(e.target.value) || min)))}
    />
  )

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
    if (data.app !== 'vocapp') return setMsg(t('הקובץ אינו גיבוי של VocApp'))
    if (!confirm(t('הנתונים מהגיבוי יתווספו לנתונים הקיימים (מילים זהות יתעדכנו). להמשיך?'))) return
    await importData(data)
    setMsg(t('שוחזרו {n} מילים', { n: data.words.length }))
  }

  return (
    <div className="page form">
      <h1>{t('הגדרות')}</h1>

      <label className="inline">
        {t('שפת הממשק')}
        <select
          className="auto-width"
          value={settings.uiLang ?? ''}
          onChange={(e) => setSetting('uiLang', (e.target.value || null) as UiLang | null)}
        >
          <option value="">{t('אוטומטי (לפי הדפדפן)')}</option>
          <option value="he">עברית</option>
          <option value="en">English</option>
        </select>
      </label>

      <h2>{t('למידה')}</h2>
      <label className="inline">{t('מילים חדשות בכל סשן')} {num('wordsPerSession', 1, 20)}</label>
      <label className="inline">{t('מקסימום מילים חדשות ביום')} {num('newPerDay', 1, 100)}</label>
      <label className="inline">{t('מקסימום חזרות בסשן')} {num('reviewsPerSession', 5, 200)}</label>
      <label className="inline">
        {t('השמעה אוטומטית של המילים')}
        <input type="checkbox" checked={settings.autoPlayAudio} onChange={(e) => setSetting('autoPlayAudio', e.target.checked)} />
      </label>

      {deck && <VoiceSettings lang={deck.targetLang} />}

      <SyncSection />

      <h2>{t('גיבוי')}</h2>
      <p className="muted">{t('קובץ גיבוי מאפשר לשמור עותק של כל המילים וההתקדמות, גם בלי סנכרון.')}</p>
      <div className="row">
        <button className="btn secondary" onClick={exportBackup}>{t('ייצוא גיבוי')}</button>
        <label className="btn secondary">
          {t('שחזור מגיבוי')}
          <input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
        </label>
      </div>
      {msg && <div className="toast">{msg}</div>}

      <p className="version muted">{t('גרסה: {version}', { version: APP_VERSION })}</p>
    </div>
  )
}

/** Voice and speed for the language of the current course. */
function VoiceSettings({ lang }: { lang: string }) {
  const settings = useSettings()
  const voices = useVoices(lang)
  if (!settings) return null
  const sample = SAMPLES[lang] ?? 'Hello'

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

  return (
    <>
      <h2>{t('הקראה ({lang})', { lang: langName(lang) })}</h2>
      {voices.length === 0 ? (
        <p className="muted">{t('לא נמצאו קולות לשפה הזו בדפדפן. נסה את Edge או Chrome, או טלפון.')}</p>
      ) : (
        <>
          <label>
            {t('קול')}
            <div className="row">
              <select value={settings.voices[lang] ?? ''} onChange={(e) => chooseVoice(e.target.value)}>
                <option value="">{t('אוטומטי – {name}', { name: voices[0].name })}</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn secondary" onClick={() => speak(sample, lang)}><Volume2 size={18} /> {t('השמעה')}</button>
            </div>
          </label>
          <label className="inline">
            {t('מהירות: {n}', { n: settings.speechRate.toFixed(2) })}
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
              <Lightbulb size={16} /> {t('הקולות כאן בסיסיים. ב-Microsoft Edge יש קולות "Natural" טבעיים יותר, וב-Chrome יש קול של Google.')}
            </p>
          )}
        </>
      )}
    </>
  )
}
