import { MedalBadge, useMedals } from '../components/Medals'
import { t } from '../lib/i18n'
import type { Medal, MedalGroup } from '../lib/medals'

const TRACKS: { group: Exclude<MedalGroup, 'special'>; title: () => string }[] = [
  { group: 'learned', title: () => t('מילים שנלמדו') },
  { group: 'longterm', title: () => t('מילים בזיכרון ארוך') },
  { group: 'streak', title: () => t('רצף ימים') },
  { group: 'goal', title: () => t('ימים שעמדת ביעד') },
  { group: 'answers', title: () => t('מספר תשובות') },
  { group: 'tests', title: () => t('מבחנים') },
]

/**
 * Medals in two parts: one card per topic showing its bronze → diamond ladder,
 * and the one-off special medals.
 */
export default function Achievements() {
  const medals = useMedals()
  if (!medals) return null
  const earnedCount = medals.filter((m) => m.earned).length
  const special = [...medals.filter((m) => m.group === 'special')].sort((a, b) => Number(b.earned) - Number(a.earned))

  return (
    <div className="page achievements">
      <h1>{t('הישגים')}</h1>
      <p className="muted">{t('{n} מתוך {total} מדליות', { n: earnedCount, total: medals.length })}</p>

      <h2>{t('מדליות לפי נושא')}</h2>
      <ul className="tracks">
        {TRACKS.map(({ group, title }) => (
          <Track key={group} title={title()} medals={medals.filter((m) => m.group === group)} />
        ))}
      </ul>

      <h2>{t('מדליות מיוחדות')}</h2>
      <ul className="medal-grid">
        {special.map((m) => (
          <li key={m.id} className={m.earned ? '' : 'locked'}>
            <MedalBadge medal={m} />
            <b>{m.title}</b>
            <span className="muted">{m.description}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Track({ title, medals }: { title: string; medals: Medal[] }) {
  const earned = medals.filter((m) => m.earned).length
  // What's left: on the next medal to win, or on the top one once all four are won
  const next = medals.find((m) => !m.earned) ?? medals[medals.length - 1]
  return (
    <li className="track">
      <div className="track-head">
        <b>{title}</b>
        <span className="muted"><bdi>{earned} / {medals.length}</bdi></span>
      </div>
      <div className="track-steps">
        {medals.map((m) => (
          <div key={m.id} className={`track-step ${m.earned ? 'on' : ''}`} title={`${m.title} · ${m.description}`}>
            <MedalBadge medal={m} size={46} />
            <small>{m.target.toLocaleString()}</small>
          </div>
        ))}
      </div>
      {next.hint && <span className="medal-next">{next.hint}</span>}
    </li>
  )
}
