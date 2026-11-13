import { ChevronLeft, FilePen, Gamepad2, Repeat2, Sprout, Target } from 'lucide-react'
import { DailyGoalCard } from '../components/Goal'
import { MedalsLink, NewMedals } from '../components/Medals'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { t } from '../lib/i18n'
import { useSettings } from '../lib/settings'
import { studyStats } from '../lib/stats'
import type { Study } from '../lib/useDeck'

export default function Home({ study }: { study: Study }) {
  const stats = useLiveQuery(() => studyStats(study.deckIds), [study.deckIds.join()])
  const settings = useSettings()
  if (!stats || !settings) return null

  const newLeftToday = Math.max(0, settings.newPerDay - stats.learnedToday)

  return (
    <div className="page home">
      <DailyGoalCard due={stats.due} />
      <NewMedals />

      <div className="home-tiles">
        {/* The main action is green: review when words are due, otherwise learning new ones. */}
        <Link to="/review" className={`home-tile wide ${stats.due ? 'primary' : 'disabled'}`}>
          <span className="tile-icon"><Repeat2 size={20} /></span>
          <span className="grow">
            <h2>{t('חזרה')}</h2>
            <p>
              {stats.due
                ? t('{n} מילים מחכות לחזרה', { n: stats.due })
                : stats.dueTomorrow
                  ? t('אין חזרות עכשיו · {n} מחר', { n: stats.dueTomorrow })
                  : t('אין חזרות כרגע')}
            </p>
          </span>
          <ChevronLeft className="chev flip" size={20} />
        </Link>

        <Link to="/learn" className={`home-tile wide ${stats.due ? '' : 'primary'} ${stats.newWords ? '' : 'disabled'}`}>
          <span className="tile-icon"><Sprout size={20} /></span>
          <span className="grow">
            <h2>{t('למידת מילים חדשות')}</h2>
            <p>
              {stats.newWords === 0
                ? t('אין מילים חדשות – הוסף עוד')
                : newLeftToday === 0
                  ? t('עברת את מכסת היום · אפשר להמשיך בכל זאת')
                  : t('{n} מילים ממתינות · עוד {left} היום', { n: stats.newWords, left: newLeftToday })}
            </p>
          </span>
          <ChevronLeft className="chev flip" size={20} />
        </Link>

        {stats.learned > 0 && (
          <Link to="/games" className="home-tile">
            <span className="tile-icon"><Gamepad2 size={20} /></span>
            <h2>{t('משחקים')}</h2>
            <p>{t('המילים שלמדת, בדרך משחקית')}</p>
          </Link>
        )}

        {stats.learned > 0 && (
          <Link to="/test" className="home-tile">
            <span className="tile-icon"><FilePen size={20} /></span>
            <h2>{t('מבחן')}</h2>
            <p>{t('בדקו כמה אתם יודעים, עם ציון באחוזים')}</p>
          </Link>
        )}

        {stats.learned > 0 && (
          <Link to="/difficult" className="home-tile wide">
            <span className="tile-icon"><Target size={20} /></span>
            <span className="grow">
              <h2>{t('תרגול מילים קשות')}</h2>
              <p>
                {stats.difficult ? t('{n} מילים קשות', { n: stats.difficult }) : t('המילים החלשות ביותר')} ·{' '}
                {t('לא משפיע על לוח החזרות')}
              </p>
            </span>
            <ChevronLeft className="chev flip" size={20} />
          </Link>
        )}
      </div>

      <div className="stats">
        <div><b>{stats.total}</b><span>{t('מילים')}</span></div>
        <div><b>{stats.learned}</b><span>{t('נלמדו')}</span></div>
        <div><b>{stats.longTerm}</b><span>{t('בזיכרון ארוך')}</span></div>
      </div>
      <MedalsLink />
      {stats.known > 0 && (
        <p className="muted center-text">
          <Link to="/words?filter=known">{t('{n} מילים מסומנות כמוכרות', { n: stats.known })}</Link>
        </p>
      )}

      {stats.total === 0 && (
        <div className="card onboarding">
          <h2>{t('הקורס ריק')}</h2>
          <p>{t('הוסף מילים – אחת אחת או כרשימה – או בחר קורס מוכן.')}</p>
          <div className="row">
            <Link className="btn" to="/words/new">{t('הוספת מילה')}</Link>
            <Link className="btn secondary" to="/import">{t('ייבוא רשימה')}</Link>
            <Link className="btn secondary" to="/courses">{t('קורסים')}</Link>
          </div>
        </div>
      )}
    </div>
  )
}
