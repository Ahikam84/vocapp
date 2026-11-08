import { Cloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { t, uiLocale } from '../lib/i18n'
import {
  isGoogleEnabled, sendLoginCode, signInWithGoogle, signOut, syncNow, UnsyncedChangesError, useSyncStatus, verifyLoginCode,
} from '../lib/sync'

/** Google's multi-colour "G", as their sign-in button guidelines ask. */
const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
)

export function SyncSection() {
  const status = useSyncStatus()
  const [google, setGoogle] = useState(false)
  useEffect(() => {
    if (status.state === 'signed-out') isGoogleEnabled().then(setGoogle)
  }, [status.state])
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // With Google available, the email sign-in is tucked behind a link.
  const [showEmail, setShowEmail] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (status.state === 'disabled')
    return (
      <>
        <h2>{t('סנכרון בענן')}</h2>
        <p className="muted">{t('הסנכרון לא מוגדר בגרסה הזו (חסרים פרטי Supabase).')}</p>
      </>
    )

  if (status.state === 'signed-out')
    return (
      <>
        <h2>{t('סנכרון בענן')}</h2>
        <p className="muted">{t('התחבר כדי שהמילים וההתקדמות יהיו זמינות בכל מכשיר.')}</p>
        {google && (
          <>
            <button className="btn google-btn" disabled={busy} onClick={() => run(signInWithGoogle)}>
              <GoogleLogo /> {t('התחברות עם Google')}
            </button>
            {!showEmail && (
              <p className="or-line">
                <button className="link-btn" onClick={() => setShowEmail(true)}>{t('התחברות במייל')}</button>
              </p>
            )}
            {showEmail && <p className="or-line muted">{t('או במייל')}</p>}
          </>
        )}
        {google && !showEmail ? null : !codeSent ? (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              run(async () => {
                await sendLoginCode(email.trim())
                setCodeSent(true)
              })
            }}
          >
            <input type="email" dir="ltr" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button className="btn" disabled={busy}>{t('שליחת מייל התחברות')}</button>
          </form>
        ) : (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => verifyLoginCode(email.trim(), code.trim()))
            }}
          >
            <input
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t('קוד מהמייל (אם יש)')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <button className="btn" disabled={busy}>{t('התחברות')}</button>
            <button type="button" className="btn secondary" onClick={() => setCodeSent(false)}>{t('מייל אחר')}</button>
          </form>
        )}
        {codeSent && (
          <p className="muted">
            {t('שלחנו מייל ל-{email}. לחץ על הקישור שבמייל – הוא יחזיר אותך לאפליקציה מחובר. אם במייל מופיע קוד, אפשר גם להקליד אותו כאן.', { email })}
          </p>
        )}
        {(error || status.error) && <div className="warn">{error ?? status.error}</div>}
      </>
    )

  const label =
    status.state === 'syncing'
      ? t('מסנכרן…')
      : status.state === 'error'
        ? t('שגיאה: {message}', { message: status.error ?? '' })
        : status.lastSync
          ? t('סונכרן לאחרונה ב-{time}', {
              time: new Date(status.lastSync).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' }),
            })
          : t('מחובר')

  return (
    <>
      <h2>{t('סנכרון בענן')}</h2>
      <p>
        <Cloud size={16} style={{ verticalAlign: '-3px' }} /> {t('מחובר כ-')}
        <span dir="ltr">{status.email}</span>
        <br />
        <span className={status.state === 'error' ? 'warn-text' : 'muted'}>{label}</span>
      </p>
      <div className="row">
        <button className="btn secondary" disabled={status.state === 'syncing'} onClick={() => syncNow()}>{t('סנכרון עכשיו')}</button>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              if (!confirm(t('להתנתק? הקורסים וההתקדמות יימחקו מהמכשיר הזה וייטענו שוב כשתתחבר.'))) return
              try {
                await signOut()
              } catch (e) {
                if (!(e instanceof UnsyncedChangesError)) throw e
                if (confirm(t('לא הצלחנו לשמור בענן את השינויים האחרונים ({message}). להתנתק בכל זאת? השינויים האלה יאבדו.', { message: e.message })))
                  await signOut(true)
              }
            })
          }
        >
          {t('התנתקות')}
        </button>
      </div>
    </>
  )
}
