import { t } from '../lib/i18n'
import { setSetting } from '../lib/settings'
import { Mascot } from './Mascot'
import { SignIn } from './SyncSection'

/**
 * First launch, before any course: invites the learner to sign in, so words and progress are kept
 * and follow them to any device (and come back on a new one). Signing in is optional.
 */
export function Welcome() {
  return (
    <div className="page welcome">
      <Mascot mood="idle" size={190} />
      <h1>{t('ברוכים הבאים ל-VocApp!')}</h1>
      <p className="muted">{t('התחברו כדי שהמילים וההתקדמות יישמרו בענן: הן לא יאבדו אם תחליפו טלפון, ויהיו זמינות בכל מכשיר.')}</p>
      <SignIn returnTo="/" />
      <button className="link-btn welcome-skip" onClick={() => setSetting('welcomeSeen', true)}>
        {t('להמשיך בלי חשבון')}
      </button>
      <p className="muted small">{t('אפשר להתחבר גם אחר כך, בהגדרות.')}</p>
    </div>
  )
}
