import { useEffect } from 'react'
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
      aria-label="השמע"
      title="השמע"
    >
      🔊
    </button>
  )
}

/** 0–5 growth indicator, from seed to full plant. */
export function Plant({ level }: { level: number }) {
  const icons = ['🌰', '🌱', '🌿', '🪴', '🌳', '🌳']
  return (
    <span className="plant" title={`חוזק זיכרון ${level}/5`}>
      {icons[level]}
    </span>
  )
}

/** Wraps target-language text so it renders left-to-right inside the RTL UI. */
export function T({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={className}>
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
    <button type="button" className="known-btn" onClick={onClick} title="המילה לא תופיע יותר בלמידה ובחזרות">
      ✓ כבר מכיר
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
        ביטול
      </button>
    </div>
  )
}
