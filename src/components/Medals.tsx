import { Lock } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../lib/i18n'
import { loadMedals, type Medal } from '../lib/medals'
import { setSetting, useSettings } from '../lib/settings'

/** Medal artwork: "<track>-<tier>.webp" for the four-tier tracks, "<id>.webp" for the special medals. */
const ART = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/medals/*.webp', { eager: true, import: 'default' }) as Record<string, string>).map(
    ([path, url]) => [path.split('/').pop()!.replace('.webp', ''), url],
  ),
)
const artFor = (m: Medal) => ART[m.group === 'special' ? m.id : `${m.group}-${m.tier}`]

export function useMedals(): Medal[] | undefined {
  const settings = useSettings()
  return useLiveQuery(
    () => (settings ? loadMedals(settings.dailyGoalType, settings.dailyGoal) : undefined),
    [settings?.dailyGoalType, settings?.dailyGoal],
  )
}

/** The medal's artwork; until earned, the same in grey with a lock. */
export function MedalBadge({ medal, size = 64 }: { medal: Medal; size?: number }) {
  return (
    <span className={`medal-art ${medal.earned ? '' : 'locked'}`} style={{ width: size, height: size }} aria-hidden="true">
      <img src={artFor(medal)} alt="" width={size} height={size} draggable={false} />
      {!medal.earned && size >= 40 && <span className="medal-lock"><Lock size={Math.round(size * 0.22)} /></span>}
    </span>
  )
}

/** Home-screen link: how many medals so far, with the latest few. */
export function MedalsLink() {
  const medals = useMedals()
  if (!medals) return null
  const earned = medals.filter((m) => m.earned)
  // The closest medal still to win, as a nudge
  const next = medals
    .filter((m) => !m.earned && m.tier !== 'special' && m.hint)
    .sort((a, b) => b.value / b.target - a.value / a.target)[0]
  return (
    <Link to="/medals" className="medals-link">
      <span className="medals-row">
        {earned.slice(-3).map((m) => <MedalBadge key={m.id} medal={m} size={28} />)}
      </span>
      <span className="grow">
        {t('הישגים')}
        {next && <small className="muted medals-next">{next.hint}</small>}
      </span>
      <b><bdi>{earned.length} / {medals.length}</bdi></b>
    </Link>
  )
}

/**
 * Pop-up for medals earned since they were last seen on this device. The first
 * time it runs it only records what's already earned, so nobody gets 15 at once.
 */
/** Whether the new-medals pop-up has something to show (other pop-ups wait for it). */
export function useFreshMedals(): boolean | undefined {
  const settings = useSettings()
  const medals = useMedals()
  if (!medals || !settings) return undefined
  const seen = settings.medalsSeen
  return !!seen && medals.some((m) => m.earned && !seen.includes(m.id))
}

export function NewMedals() {
  const settings = useSettings()
  const medals = useMedals()
  const seen = settings?.medalsSeen
  useEffect(() => {
    if (medals && settings && seen === null) setSetting('medalsSeen', medals.filter((m) => m.earned).map((m) => m.id))
  }, [medals, settings, seen])
  // Wait for the daily-goal question to be answered first, so two pop-ups never stack.
  if (!medals || !settings || !seen || !settings.goalChosen) return null
  const fresh = medals.filter((m) => m.earned && !seen.includes(m.id))
  if (!fresh.length) return null

  const close = () => setSetting('medalsSeen', [...seen, ...fresh.map((m) => m.id)])
  const shown = fresh.slice(-3)
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="new-medal-title">
      <div className="modal new-medal">
        <div className="new-medal-badges">
          {shown.map((m) => <MedalBadge key={m.id} medal={m} size={shown.length > 1 ? 64 : 92} />)}
        </div>
        <h2 id="new-medal-title">{fresh.length > 1 ? t('{n} מדליות חדשות!', { n: fresh.length }) : t('מדליה חדשה!')}</h2>
        {shown.map((m) => (
          <p key={m.id}>
            <b>{m.title}</b> · <span className="muted">{m.description}</span>
          </p>
        ))}
        <div className="row center">
          <button className="btn" autoFocus onClick={close}>{t('יופי!')}</button>
          <Link className="btn secondary" to="/medals" onClick={close}>{t('לכל ההישגים')}</Link>
        </div>
      </div>
    </div>
  )
}
