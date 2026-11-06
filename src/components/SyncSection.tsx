import { useState } from 'react'
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
        <h2>סנכרון בענן</h2>
        <p className="muted">הסנכרון לא מוגדר בגרסה הזו (חסרים פרטי Supabase).</p>
      </>
    )

  if (status.state === 'signed-out')
    return (
      <>
        <h2>סנכרון בענן</h2>
        <p className="muted">התחבר כדי שהמילים וההתקדמות יהיו זמינות בכל מכשיר.</p>
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
            <button className="btn" disabled={busy}>שליחת מייל התחברות</button>
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
              placeholder="קוד מהמייל (אם יש)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <button className="btn" disabled={busy}>התחברות</button>
            <button type="button" className="btn secondary" onClick={() => setCodeSent(false)}>מייל אחר</button>
          </form>
        )}
        {codeSent && (
          <p className="muted">
            שלחנו מייל ל-<span dir="ltr">{email}</span>. לחץ על הקישור שבמייל – הוא יחזיר אותך לאפליקציה מחובר. אם
            במייל מופיע קוד, אפשר גם להקליד אותו כאן.
          </p>
        )}
        {(error || status.error) && <div className="warn">{error ?? status.error}</div>}
      </>
    )

  const label =
    status.state === 'syncing'
      ? 'מסנכרן…'
      : status.state === 'error'
        ? `שגיאה: ${status.error}`
        : status.lastSync
          ? `סונכרן לאחרונה ב-${new Date(status.lastSync).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
          : 'מחובר'

  return (
    <>
      <h2>סנכרון בענן</h2>
      <p>
        ☁️ מחובר כ-<span dir="ltr">{status.email}</span>
        <br />
        <span className={status.state === 'error' ? 'warn-text' : 'muted'}>{label}</span>
      </p>
      <div className="row">
        <button className="btn secondary" disabled={status.state === 'syncing'} onClick={() => syncNow()}>סנכרון עכשיו</button>
        <button className="btn secondary" onClick={() => run(signOut)}>התנתקות</button>
      </div>
    </>
  )
}
