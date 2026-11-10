import { MedalBadge, useMedals } from '../components/Medals'
import { t } from '../lib/i18n'

/** All medals: earned ones first, locked ones with how far along they are. */
export default function Achievements() {
  const medals = useMedals()
  if (!medals) return null
  const earned = medals.filter((m) => m.earned)
  // Locked: closest to being earned first
  const locked = medals.filter((m) => !m.earned).sort((a, b) => b.value / b.target - a.value / a.target)

  return (
    <div className="page achievements">
      <h1>{t('הישגים')}</h1>
      <p className="muted">{t('{n} מתוך {total} מדליות', { n: earned.length, total: medals.length })}</p>

      {earned.length > 0 && (
        <ul className="medal-grid">
          {earned.map((m) => (
            <li key={m.id}>
              <MedalBadge medal={m} />
              <b>{m.title}</b>
              <span className="muted">{m.description}</span>
              {m.hint && <span className="medal-next">{m.hint}</span>}
            </li>
          ))}
        </ul>
      )}

      {locked.length > 0 && (
        <>
          <h2>{t('עוד לא הושגו')}</h2>
          <ul className="medal-grid">
            {locked.map((m) => (
              <li key={m.id} className="locked">
                <MedalBadge medal={m} />
                <b>{m.title}</b>
                <span className="muted">{m.description}</span>
                {m.target > 1 && (
                  <span className="medal-progress" title={`${m.value} / ${m.target}`}>
                    <i style={{ width: `${(m.value / m.target) * 100}%` }} />
                    <small><bdi>{m.value} / {m.target}</bdi></small>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
