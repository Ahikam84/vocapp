import { Check, Undo2, Volume2, VolumeX } from 'lucide-react'
import { useEffect } from 'react'
import { t } from '../lib/i18n'
import { setSetting, useSettings } from '../lib/settings'
import { speak } from '../lib/tts'

export function SpeakButton({ text, lang, small }: { text: string; lang: string; small?: boolean }) {
  return (
    <button
      type="button"
      className={small ? 'icon-btn small' : 'icon-btn'}
      onClick={(e) => {
        e.stopPropagation()
        speak(text, lang)
      }}
      aria-label={t('השמע')}
      title={t('השמע')}
    >
      <Volume2 size={small ? 16 : 20} />
    </button>
  )
}

const STRENGTH_NAMES = ['חדשה', 'חלשה', 'מתחזקת', 'טובה', 'חזקה', 'בזיכרון ארוך']
/** Name of a 0–5 memory strength level. */
export function strengthName(level: number): string {
  return t(STRENGTH_NAMES[Math.max(0, Math.min(5, level))])
}

/** 0–5 memory strength as five rising bars. */
export function Strength({ level }: { level: number }) {
  const label = t('חוזק זיכרון {n} מתוך 5', { n: level })
  return (
    <span className="strength" title={label} aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= level ? 'on' : ''} />
      ))}
    </span>
  )
}

/**
 * Strength bars inside an exercise. `prev` is the level before this answer:
 * bars gained pop in green, bars lost drain red, and a full meter lights up in a wave.
 */
export function Meter({ level, prev, max, label }: { level: number; prev: number; max: number; label: string }) {
  const diff = level - prev
  const complete = level >= max && prev < max
  return (
    <div className={`meter ${diff < 0 ? 'lost' : ''} ${complete ? 'complete' : ''}`} aria-label={label} title={label}>
      <span className="meter-bars">
        {Array.from({ length: max }, (_, i) => {
          const n = i + 1
          const cls = n <= Math.min(level, prev) ? 'on' : n <= level ? 'on gain' : n <= prev ? 'loss' : ''
          return <i key={i} className={cls} style={{ height: `${30 + (70 * n) / max}%`, animationDelay: complete ? `${i * 70}ms` : undefined }} />
        })}
      </span>
      <span className="meter-label">{label}</span>
      {diff > 0 && <span className="meter-plus" key={level}>+{diff}</span>}
    </div>
  )
}

/**
 * Wraps text in the language being learned (or any text that may differ in
 * direction from the UI) so Hebrew renders right-to-left and Spanish left-to-right.
 */
export function T({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span dir="auto" className={className}>
      {children}
    </span>
  )
}

/** A word in the language being learned, with its transliteration under it when it has one (Arabic courses). */
export function Term({ word, className }: { word: { term: string; reading?: string }; className?: string }) {
  if (!word.reading) return <T className={className}>{word.term}</T>
  return (
    <span className="with-reading">
      <T className={className}>{word.term}</T>
      <span className="reading" dir="rtl">{word.reading}</span>
    </span>
  )
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  )
}

/**
 * Session-bar sound switch. It flips the same "play words automatically"
 * setting as the Settings page, so muting during practice sticks next time too.
 */
export function SoundToggle() {
  const settings = useSettings()
  if (!settings) return null
  const on = settings.autoPlayAudio
  return (
    <button
      type="button"
      className={on ? 'known-btn' : 'known-btn muted-on'}
      onClick={() => setSetting('autoPlayAudio', !on)}
      title={on ? t('השתקת ההשמעה האוטומטית') : t('הפעלת ההשמעה האוטומטית')}
      aria-pressed={!on}
    >
      {on ? <><VolumeX size={14} /> {t('השתקה')}</> : <><Volume2 size={14} /> {t('הפעלת קול')}</>}
    </button>
  )
}

/** Session-bar button that takes the current word out of learning for good. */
export function KnownButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="known-btn" onClick={onClick} title={t('המילה לא תופיע יותר בלמידה ובחזרות')}>
      <Check size={14} /> {t('כבר מכיר')}
    </button>
  )
}

/** Bottom toast with an undo action that hides itself after a few seconds. Give it a key per subject to restart the timer. */
export function UndoToast({ message, onUndo, onClose }: { message: React.ReactNode; onUndo: () => void; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 7000)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="undo-toast" role="status">
      <span>{message}</span>
      <button
        type="button"
        onClick={() => {
          onUndo()
          onClose()
        }}
      >
        <Undo2 size={16} /> {t('ביטול')}
      </button>
    </div>
  )
}

/** "<word>" was marked as known – shared by the learning and review screens. */
export function knownMessage(term: string) {
  const [before, after] = t('"{word}" סומנה כמוכרת ולא תופיע יותר').split('{word}')
  return (
    <>
      {before}
      <T>{term}</T>
      {after}
    </>
  )
}

/** Lets the user choose which of the studied courses new words go into (shown only with 2+ courses). */
export function CourseSelect({ decks, value, onChange }: { decks: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  if (decks.length < 2) return null
  return (
    <label>
      {t('לקורס')}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {decks.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
    </label>
  )
}
