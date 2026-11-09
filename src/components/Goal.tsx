import { Flame, PartyPopper, Snowflake } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { dailyStatus, xpSince, type DailyStatus, type GoalType } from '../lib/goals'
import { t } from '../lib/i18n'
import { useSettings } from '../lib/settings'
import { homeMood, Mascot } from './Mascot'

export function goalUnit(type: GoalType): string {
  return type === 'xp' ? 'XP' : type === 'minutes' ? t('דקות') : t('תשובות')
}

/** "10 / 50 XP" – the numbers kept left-to-right so they don't flip inside Hebrew text. */
function GoalAmount({ value, goal, type }: { value: number; goal: number; type: GoalType }) {
  return (
    <span className="goal-amount">
      <bdi dir="ltr"><b>{Math.min(value, 9999)}</b> / {goal}</bdi> {goalUnit(type)}
    </span>
  )
}

function useDailyStatus(): DailyStatus | undefined {
  const settings = useSettings()
  return useLiveQuery(
    () => (settings ? dailyStatus(settings.dailyGoalType, settings.dailyGoal) : undefined),
    [settings?.dailyGoalType, settings?.dailyGoal],
  )
}

/** Circle that fills up towards the daily goal. */
export function GoalRing({ value, goal, size = 64 }: { value: number; goal: number; size?: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const part = Math.min(1, value / Math.max(1, goal))
  return (
    <svg className={`goal-ring ${part >= 1 ? 'full' : ''}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={r} className="track" />
      <circle cx="32" cy="32" r={r} className="fill" strokeDasharray={c} strokeDashoffset={c * (1 - part)} transform="rotate(-90 32 32)" />
    </svg>
  )
}

function StreakBadges({ status }: { status: DailyStatus }) {
  const { days, freezes } = status.streak
  return (
    <div className="streak-badges">
      <span className={`badge flame ${days ? 'on' : ''}`} title={t('ימים ברצף שבהם עמדת ביעד היומי')}>
        <Flame size={16} /> {days}
      </span>
      {freezes > 0 && (
        <span className="badge freeze" title={t('הקפאת רצף: יום שתפספס לא ישבור את הרצף. מקבלים אחת על כל 7 ימים ברצף (עד 2).')}>
          <Snowflake size={16} /> {freezes}
        </span>
      )}
    </div>
  )
}

/** Home-screen card: the cat, today's goal and the streak. `due` = words waiting for review. */
export function DailyGoalCard({ due }: { due: number }) {
  const status = useDailyStatus()
  if (!status) return null
  const { value, goal, type, done, streak } = status
  const mood = homeMood({ goalDone: done, answeredToday: status.today.answers, due, hour: new Date().getHours() })
  return (
    <>
    <Mascot mood={mood} size={220} />
    <div className={`goal-card ${done ? 'done' : ''}`}>
      <GoalRing value={value} goal={goal} />
      <div className="grow">
        <h2>{done ? t('עמדת ביעד היומי!') : t('היעד היומי')}</h2>
        <p>
          <GoalAmount value={value} goal={goal} type={type} />
          {' · '}
          <span>{streak.days === 1 ? t('{n} יום ברצף', { n: 1 }) : t('{n} ימים ברצף', { n: streak.days })}</span>
        </p>
        <Link to="/settings" className="muted small-link">{t('שינוי היעד')}</Link>
      </div>
      <StreakBadges status={status} />
    </div>
    </>
  )
}

/** End-of-session box: XP from this session and where the daily goal stands. */
export function SessionReward({ since }: { since: number }) {
  const status = useDailyStatus()
  const xp = useLiveQuery(() => xpSince(since), [since])
  if (!status || xp === undefined) return null
  const { value, goal, type, done, streak } = status
  return (
    <div className={`session-reward ${done ? 'done' : ''}`}>
      <Mascot mood={done ? 'party' : 'water'} size={240} />
      <div className="xp"><bdi dir="ltr">+{xp} XP</bdi></div>
      <div className="row center goal-line">
        <GoalRing value={value} goal={goal} size={40} />
        <span>
          {done ? (
            <>
              <PartyPopper size={16} /> {t('עמדת ביעד היומי!')}{' '}
              {streak.days === 1 ? t('{n} יום ברצף', { n: 1 }) : t('{n} ימים ברצף', { n: streak.days })}
            </>
          ) : (
            <>
              {t('היעד היומי:')} <GoalAmount value={value} goal={goal} type={type} />
            </>
          )}
        </span>
      </div>
    </div>
  )
}
