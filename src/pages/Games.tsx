import { ChevronLeft, CircleCheckBig, CloudRain, Headphones, LayoutGrid, Link2, Shapes, Sprout, TextCursorInput, VenusAndMars } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { MIN_CLOZE } from '../games/Cloze'
import { MIN_GENDER } from '../games/Gender'
import { canPlayOdd } from '../games/OddOneOut'
import { clozeFor, genderOf, loadGameWords, MIN_GAME_WORDS, type GameId } from '../lib/games'
import { t } from '../lib/i18n'
import { useSettings } from '../lib/settings'
import type { Study } from '../lib/useDeck'

interface GameInfo {
  id: GameId
  icon: typeof Link2
  title: () => string
  text: () => string
  /** Only for courses in this language */
  lang?: string
}

const GAMES: GameInfo[] = [
  { id: 'pairs', icon: Link2, title: () => t('זוגות נגד השעון'), text: () => t('חברו כמה שיותר מילים לתרגום שלהן בדקה אחת') },
  { id: 'falling', icon: CloudRain, title: () => t('מילים נופלות'), text: () => t('כתבו את המילה לפני שהתרגום שלה נוחת') },
  { id: 'cloze', icon: TextCursorInput, title: () => t('השלם את המשפט'), text: () => t('בחרו את המילה שחסרה במשפט') },
  { id: 'plant', icon: Sprout, title: () => t('הציל את הצמח'), text: () => t('נחשו את המילה אות אחר אות, לפני שהצמח נובל') },
  { id: 'listen', icon: Headphones, title: () => t('האזנה'), text: () => t('שמעו מילה, בלי לראות אותה, ובחרו מה היא אומרת') },
  { id: 'truefalse', icon: CircleCheckBig, title: () => t('נכון או לא נכון'), text: () => t('האם זה התרגום הנכון? כמה שיותר בדקה אחת') },
  { id: 'memory', icon: LayoutGrid, title: () => t('זיכרון'), text: () => t('הפכו קלפים ומצאו כל מילה והתרגום שלה') },
  { id: 'odd', icon: Shapes, title: () => t('יוצא דופן'), text: () => t('ארבע מילים, שלוש מאותו נושא: מי לא שייכת?') },
  { id: 'gender', icon: VenusAndMars, title: () => t('el או la?'), text: () => t('בחרו את ה-article הנכון לכל מילה, בדקה אחת'), lang: 'es' },
]

/** The games menu. Games use learned words only and never change the review schedule. */
export default function Games({ study }: { study: Study }) {
  const settings = useSettings()
  const counts = useLiveQuery(async () => {
    const words = await loadGameWords(study.deckIds)
    return {
      all: words.length,
      cloze: words.filter((w) => clozeFor(w)).length,
      gender: words.filter((w) => genderOf(w)).length,
      odd: canPlayOdd(words),
    }
  }, [study.deckIds.join()])
  if (!settings || !counts) return null

  // Why a game can't be played yet, if it can't
  const locked = (id: GameId): string | null => {
    if (counts.all < MIN_GAME_WORDS) return t('צריך לפחות {n} מילים שלמדת', { n: MIN_GAME_WORDS })
    if (id === 'cloze' && counts.cloze < MIN_CLOZE) return t('צריך לפחות {n} מילים שלמדת עם משפט לדוגמה', { n: MIN_CLOZE })
    if (id === 'odd' && !counts.odd) return t('משתמש בנושאים של הקורסים המוכנים')
    if (id === 'gender' && counts.gender < MIN_GENDER) return t('צריך לפחות {n} שמות עצם שלמדת עם el או la', { n: MIN_GENDER })
    return null
  }

  return (
    <div className="page games">
      <h1>{t('משחקים')}</h1>
      <p className="muted">{t('תרגול של המילים שכבר למדת, בדרך משחקית. המשחקים לא משנים את לוח החזרות.')}</p>
      {counts.all < MIN_GAME_WORDS && (
        <div className="warn">{t('כדי לשחק צריך לפחות {n} מילים שכבר למדת. כרגע יש {count}.', { n: MIN_GAME_WORDS, count: counts.all })}</div>
      )}
      {GAMES.filter((g) => !g.lang || g.lang === study.deck.targetLang).map(({ id, icon: Icon, title, text }) => {
        const why = locked(id)
        return (
          <Link key={id} to={`/games/${id}`} className={`action-card ${why ? 'disabled' : ''}`}>
            <div className="icon"><Icon size={22} /></div>
            <div className="grow">
              <h2>{title()}</h2>
              <p>
                {why && counts.all >= MIN_GAME_WORDS ? why : text()}
                {settings.gameBest[id] ? (
                  <> · {id === 'memory' ? t('שיא: {n} מהלכים', { n: settings.gameBest[id] }) : t('שיא: {n}', { n: settings.gameBest[id] })}</>
                ) : null}
              </p>
            </div>
            <ChevronLeft className="chev flip" size={20} />
          </Link>
        )
      })}
    </div>
  )
}
