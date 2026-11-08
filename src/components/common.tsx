import { Check, Undo2, Volume2 } from 'lucide-react'
import { useEffect } from 'react'
import { t } from '../lib/i18n'
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

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
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
