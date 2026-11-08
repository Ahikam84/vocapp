import { ChevronLeft, Flame, Repeat2, Sprout, Target } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import type { Deck } from '../lib/db'
import { t } from '../lib/i18n'
import { useSettings } from '../lib/settings'
import { deckStats } from '../lib/stats'

export default function Home({ deck }: { deck: Deck }) {
  const stats = useLiveQuery(() => deckStats(deck.id), [deck.id])
  const settings = useSettings()
  if (!stats || !settings) return null

  const newLeftToday = Math.max(0, settings.newPerDay - stats.learnedToday)

  return (
    <div className="page home">
      <div className="streak">
        <Flame size={18} /> {t(stats.streak === 1 ? '{n} יום ברצף' : '{n} ימים ברצף', { n: stats.streak })}
        <span> · {t('{n} תשובות היום', { n: stats.answeredToday })}</span>
      </div>

      <Link to="/review" className={`action-card primary ${stats.due ? '' : 'disabled'}`}>
        <div className="icon"><Repeat2 size={22} /></div>
        <div className="grow">
          <h2>{t('חזרה')}</h2>
          <p>
            {stats.due
              ? t('{n} מילים מחכות לחזרה', { n: stats.due })
              : stats.dueTomorrow
                ? t('אין חזרות עכשיו · {n} מחר', { n: stats.dueTomorrow })
                : t('אין חזרות כרגע')}
          </p>
        </div>
        <ChevronLeft className="chev flip" size={20} />
      </Link>

      <Link to="/learn" className={`action-card ${stats.newWords && newLeftToday ? '' : 'disabled'}`}>
        <div className="icon"><Sprout size={22} /></div>
        <div className="grow">
          <h2>{t('למידת מילים חדשות')}</h2>
          <p>
            {stats.newWords === 0
              ? t('אין מילים חדשות – הוסף עוד')
              : newLeftToday === 0
                ? t('הגעת ליעד היומי')
                : t('{n} מילים ממתינות · עוד {left} היום', { n: stats.newWords, left: newLeftToday })}
          </p>
        </div>
        <ChevronLeft className="chev flip" size={20} />
      </Link>

      {stats.learned > 0 && (
        <Link to="/difficult" className="action-card">
          <div className="icon"><Target size={22} /></div>
          <div className="grow">
            <h2>{t('תרגול מילים קשות')}</h2>
            <p>
              {stats.difficult ? t('{n} מילים קשות', { n: stats.difficult }) : t('המילים החלשות ביותר')} ·{' '}
              {t('לא משפיע על לוח החזרות')}
            </p>
          </div>
          <ChevronLeft className="chev flip" size={20} />
        </Link>
      )}

      <div className="stats">
        <div><b>{stats.total}</b><span>{t('מילים')}</span></div>
        <div><b>{stats.learned}</b><span>{t('נלמדו')}</span></div>
        <div><b>{stats.longTerm}</b><span>{t('בזיכרון ארוך')}</span></div>
      </div>
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
