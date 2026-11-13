import { Flame, PartyPopper, Snowflake } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { DEFAULT_GOAL, dailyStatus, GOAL_PRESETS, xpSince, type DailyStatus, type GoalType } from '../lib/goals'
import { t } from '../lib/i18n'
import { setSetting, useSettings } from '../lib/settings'
import { homeMood, Mascot } from './Mascot'
import { NewMedals } from './Medals'

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

/** A greeting for the time of day. */
function greeting(hour: number): string {
  return hour >= 5 && hour < 12 ? t('בוקר טוב!') : hour < 17 && hour >= 12 ? t('צהריים טובים!') : hour >= 17 && hour < 22 ? t('ערב טוב!') : t('לילה טוב!')
}

/** Home screen top: the cat and a greeting on the green header, then today's goal and the streak. `due` = words waiting for review. */
export function DailyGoalCard({ due }: { due: number }) {
  const status = useDailyStatus()
  if (!status) return null
  const { value, goal, type, done, streak } = status
  const hour = new Date().getHours()
  const mood = homeMood({ goalDone: done, answeredToday: status.today.answers, due, hour })
  const left = Math.max(0, goal - value)
  return (
    <>
    <section className="home-hero">
      <Mascot mood={mood} size={150} />
      <div className="hero-text">
        <p className="hero-hello">{greeting(hour)}</p>
        <p className="hero-line">
          {done
            ? t('עמדת ביעד היומי!')
            : t('עוד {n} {unit} ליעד היומי', { n: left, unit: goalUnit(type) })}
        </p>
      </div>
      <svg className="hero-wave" viewBox="0 0 390 34" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 20 C 70 2, 130 2, 195 18 S 320 36, 390 12 L390 34 L0 34 Z" />
      </svg>
    </section>
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
      <GoalPrompt />
      <NewMedals />
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

const GOAL_TYPES: { type: GoalType; label: string; hint: string }[] = [
  { type: 'xp', label: 'נקודות (XP)', hint: 'כל תשובה נכונה שווה 10' },
  { type: 'minutes', label: 'דקות תרגול', hint: 'כמה זמן ביום' },
  { type: 'answers', label: 'מספר תשובות', hint: 'כמה שאלות ביום' },
]
const LEVELS = ['קליל', 'רגיל', 'רציני', 'אינטנסיבי', 'אלוף']

/** Pop-up after the first finished session: choose how the daily goal is measured and how big it is. */
export function GoalPrompt() {
  const settings = useSettings()
  const [type, setType] = useState<GoalType | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [closed, setClosed] = useState(false)
  if (!settings || settings.goalChosen || closed) return null
  const chosenType = type ?? settings.dailyGoalType
  const presets = GOAL_PRESETS[chosenType]
  const chosenAmount = amount ?? DEFAULT_GOAL[chosenType]

  async function save(keep: boolean) {
    if (keep) {
      await setSetting('dailyGoalType', chosenType)
      await setSetting('dailyGoal', chosenAmount)
    }
    // "Later" also counts as an answer: the default goal stays and the question isn't asked again.
    await setSetting('goalChosen', true)
    setClosed(true)
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="goal-prompt-title">
      <div className="modal goal-prompt">
        <h2 id="goal-prompt-title">{t('כמה רוצים לתרגל ביום?')}</h2>
        <p className="muted">{t('יעד קטן וקבוע עדיף על יעד גדול שמוותרים עליו. כל יום שעומדים בו מאריך את הרצף.')}</p>
        <div className="choice-row">
          {GOAL_TYPES.map((g) => (
            <button
              key={g.type}
              className={`choice ${g.type === chosenType ? 'on' : ''}`}
              onClick={() => {
                setType(g.type)
                setAmount(null)
              }}
            >
              <b>{t(g.label)}</b>
              <span>{t(g.hint)}</span>
            </button>
          ))}
        </div>
        <div className="choice-row amounts">
          {presets.map((n, i) => (
            <button key={n} className={`choice ${n === chosenAmount ? 'on' : ''}`} onClick={() => setAmount(n)}>
              <b><bdi>{n}</bdi> {goalUnit(chosenType)}</b>
              <span>{t(LEVELS[Math.min(i, LEVELS.length - 1)])}</span>
            </button>
          ))}
        </div>
        <div className="row center">
          <button className="btn" onClick={() => save(true)}>{t('שמירת היעד')}</button>
          <button className="btn secondary" onClick={() => save(false)}>{t('אחר כך')}</button>
        </div>
        <p className="muted small">{t('אפשר לשנות בכל רגע בהגדרות.')}</p>
      </div>
    </div>
  )
}
