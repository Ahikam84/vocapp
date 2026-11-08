import { Cloud } from 'lucide-react'
import { useState } from 'react'
import { t, uiLocale } from '../lib/i18n'
import { sendLoginCode, signOut, syncNow, useSyncStatus, verifyLoginCode } from '../lib/sync'

export function SyncSection() {
  const status = useSyncStatus()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        {!codeSent ? (
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
        <button className="btn secondary" onClick={() => run(signOut)}>{t('התנתקות')}</button>
      </div>
    </>
  )
}
