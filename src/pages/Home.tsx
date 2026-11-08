import { ChevronLeft, Flame, Repeat2, Sprout, Target } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import type { Deck } from '../lib/db'
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
        <Flame size={18} /> <b>{stats.streak}</b> {stats.streak === 1 ? 'יום' : 'ימים'} ברצף
        <span> · {stats.answeredToday} תשובות היום</span>
      </div>

      <Link to="/review" className={`action-card primary ${stats.due ? '' : 'disabled'}`}>
        <div className="icon"><Repeat2 size={22} /></div>
        <div className="grow">
          <h2>חזרה</h2>
          <p>{stats.due ? `${stats.due} מילים מחכות לחזרה` : stats.dueTomorrow ? `אין חזרות עכשיו · ${stats.dueTomorrow} מחר` : 'אין חזרות כרגע'}</p>
        </div>
        <ChevronLeft className="chev" size={20} />
      </Link>

      <Link to="/learn" className={`action-card ${stats.newWords && newLeftToday ? '' : 'disabled'}`}>
        <div className="icon"><Sprout size={22} /></div>
        <div className="grow">
          <h2>למידת מילים חדשות</h2>
          <p>
            {stats.newWords === 0
              ? 'אין מילים חדשות – הוסף עוד'
              : newLeftToday === 0
                ? 'הגעת ליעד היומי'
                : `${stats.newWords} מילים ממתינות · עוד ${newLeftToday} היום`}
          </p>
        </div>
        <ChevronLeft className="chev" size={20} />
      </Link>

      {stats.learned > 0 && (
        <Link to="/difficult" className="action-card">
          <div className="icon"><Target size={22} /></div>
          <div className="grow">
            <h2>תרגול מילים קשות</h2>
            <p>{stats.difficult ? `${stats.difficult} מילים קשות` : 'המילים החלשות ביותר'} · לא משפיע על לוח החזרות</p>
          </div>
          <ChevronLeft className="chev" size={20} />
        </Link>
      )}

      <div className="stats">
        <div><b>{stats.total}</b><span>מילים</span></div>
        <div><b>{stats.learned}</b><span>נלמדו</span></div>
        <div><b>{stats.longTerm}</b><span>בזיכרון ארוך</span></div>
      </div>
      {stats.known > 0 && (
        <p className="muted center-text">
          <Link to="/words?filter=known">{stats.known} מילים מסומנות כמוכרות</Link>
        </p>
      )}

      {stats.total === 0 && (
        <div className="card onboarding">
          <h2>ברוך הבא</h2>
          <p>כדי להתחיל, הוסף קורס מוכן, או מילים משלך – אחת אחת או כרשימה.</p>
          <div className="row">
            <Link className="btn" to="/settings#ready-courses">קורסים מוכנים</Link>
            <Link className="btn secondary" to="/words/new">הוספת מילה</Link>
            <Link className="btn secondary" to="/import">ייבוא רשימה</Link>
          </div>
        </div>
      )}
    </div>
  )
}
