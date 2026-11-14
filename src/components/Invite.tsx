import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/db'
import { MIN_GAME_WORDS } from '../lib/games'
import { t } from '../lib/i18n'
import { getSettings, setSetting, useSettings } from '../lib/settings'
import { MIN_TEST_POOL } from '../lib/test'
import { Mascot } from './Mascot'
import { useFreshMedals } from './Medals'

/** Where a session just ended: learning or review, a game, or a test. */
export type InviteAfter = 'learn' | 'game' | 'test'

type Feature = 'games' | 'test'

async function markShown(feature: Feature, at = Date.now()) {
  const { invites } = await getSettings()
  if (!invites[feature]) await setSetting('invites', { ...invites, [feature]: at })
}

/**
 * Introduces the games, once there are enough learned words for them, and on a later session the
 * test – one pop-up at a time, after the daily-goal question and any new medals. Someone who already
 * played or took a test is never invited to it.
 */
export function FeatureInvite({ after, since }: { after: InviteAfter; since: number }) {
  const settings = useSettings()
  const fresh = useFreshMedals()
  const facts = useLiveQuery(async () => ({
    learned: await db.progress.count(),
    played: !!(await db.reviews.filter((r) => r.mode === 'game').first()),
    tested: !!(await db.reviews.filter((r) => r.mode === 'test').first()),
  }), [])

  // Already found it on their own: no need to invite (and the test may follow the games).
  useEffect(() => {
    if (!facts || !settings) return
    if (facts.played && !settings.invites.games) markShown('games', 1)
    if (facts.tested && !settings.invites.test) markShown('test', 1)
  }, [facts, settings])

  if (!settings || !facts || fresh !== false || !settings.goalChosen) return null
  const { invites } = settings
  const wanted: Feature | null =
    after === 'learn' && !invites.games && !facts.played && facts.learned >= MIN_GAME_WORDS
      ? 'games'
      // The test comes in a later session than the games invitation, never in the same one.
      : after !== 'test' && !invites.test && !facts.tested && !!invites.games && invites.games < since && facts.learned >= MIN_TEST_POOL
        ? 'test'
        : null
  if (!wanted) return null

  const close = () => markShown(wanted)
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
