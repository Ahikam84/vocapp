import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/db'
import { MIN_GAME_WORDS } from '../lib/games'
import { t } from '../lib/i18n'
import { getSettings, setSetting, useSettings } from '../lib/settings'
import { useSyncStatus } from '../lib/sync'
import { MIN_TEST_POOL } from '../lib/test'
import { Mascot } from './Mascot'
import { useFreshMedals } from './Medals'
import { SignIn } from './SyncSection'

/** Where a session just ended: learning or review, a game, or a test. */
export type InviteAfter = 'learn' | 'game' | 'test'

type Feature = 'games' | 'test' | 'account'

/** Learned words before suggesting an account, so there's something worth keeping. */
export const ACCOUNT_AFTER = 20

async function markShown(feature: Feature, at = Date.now()) {
  const { invites } = await getSettings()
  if (!invites[feature]) await setSetting('invites', { ...invites, [feature]: at })
}

/**
 * Introduces the games once there are enough learned words for them, then (each in a later session)
 * signing in to keep the progress, and the test – one pop-up per session, after the daily-goal
 * question and any new medals. Nobody is invited to what they already use.
 */
export function FeatureInvite({ after, since }: { after: InviteAfter; since: number }) {
  const settings = useSettings()
  const fresh = useFreshMedals()
  const sync = useSyncStatus()
  const facts = useLiveQuery(async () => ({
    learned: await db.progress.count(),
    played: !!(await db.reviews.filter((r) => r.mode === 'game').first()),
    tested: !!(await db.reviews.filter((r) => r.mode === 'test').first()),
  }), [])

  // Already found it on their own: no need to invite (and the next invitation may follow).
  useEffect(() => {
    if (!facts || !settings) return
    if (facts.played && !settings.invites.games) markShown('games', 1)
    if (facts.tested && !settings.invites.test) markShown('test', 1)
  }, [facts, settings])

  if (!settings || !facts || fresh !== false || !settings.goalChosen) return null
  const { invites } = settings
  // One invitation per session: none if one was already shown since this session began.
  if (Object.values(invites).some((at) => at && at >= since)) return null
  const earlier = (at?: number) => !!at && at < since
  const wanted: Feature | null =
    after === 'learn' && !invites.games && !facts.played && facts.learned >= MIN_GAME_WORDS
      ? 'games'
      : after !== 'test' && !invites.account && sync.state === 'signed-out' && earlier(invites.games) && facts.learned >= ACCOUNT_AFTER
        ? 'account'
        : after !== 'test' && !invites.test && !facts.tested && earlier(invites.games) && facts.learned >= MIN_TEST_POOL
          ? 'test'
          : null
  if (!wanted) return null

  const close = () => markShown(wanted)
  if (wanted === 'account')
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="invite-title">
        <div className="modal invite">
          <Mascot mood="water" size={150} />
          <h2 id="invite-title">{t('לשמור את ההתקדמות?')}</h2>
          <p>{t('למדת כבר {n} מילים! כרגע הן שמורות רק במכשיר הזה. עם חשבון הן נשמרות בענן: לא יאבדו אם תחליפו טלפון, ויהיו זמינות בכל מכשיר.', { n: facts.learned })}</p>
          <SignIn returnTo="/" />
          <button className="link-btn" onClick={close}>{t('אחר כך')}</button>
        </div>
      </div>
    )

  const games = wanted === 'games'
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="modal invite">
        <Mascot mood={games ? 'party' : 'water'} size={150} />
        <h2 id="invite-title">{games ? t('אפשר להתחיל לשחק!') : t('רוצה לבדוק את עצמך?')}</h2>
        <p>
          {games
            ? t('למדת כבר {n} מילים, מספיק בשביל המשחקים: זוגות נגד השעון, תשבץ, האזנה ועוד. הם עוזרים לזכור את המילים בדרך כיפית, ולא משנים את לוח החזרות.', { n: facts.learned })
            : t('במבחן בוחרים כמה שאלות ואיזה סוגים, ובסוף מקבלים ציון ורואים אילו מילים כדאי לחזק. גם המבחן לא משנה את לוח החזרות.')}
        </p>
        <div className="row center">
          <Link className="btn" autoFocus to={games ? '/games' : '/test'} onClick={close}>{games ? t('למשחקים') : t('למבחן')}</Link>
          <button className="btn secondary" onClick={close}>{t('אחר כך')}</button>
        </div>
      </div>
    </div>
  )
}
