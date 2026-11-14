import { Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SessionReward } from '../components/Goal'
import { isRecord, type GameId } from '../lib/games'
import { t } from '../lib/i18n'

/** End of a game: the score, whether it's a new record, XP and the cat. */
export function GameOver({
  game,
  title,
  score,
  prevBest,
  since,
  onAgain,
}: {
  game: GameId
  title: string
  score: number
  /** Best score before this game */
  prevBest: number
  since: number
  onAgain: () => void
}) {
  const record = isRecord(game, score, prevBest)
  return (
    <div className="page center-page game-over">
      <h1>{title}</h1>
      <div className="game-score"><bdi>{score}</bdi></div>
      <p className={record ? 'game-record' : 'muted'}>
        {record ? (
          <><Trophy size={18} /> {prevBest ? t('שיא חדש! הקודם היה {n}', { n: prevBest }) : t('השיא הראשון שלך!')}</>
        ) : (
          prevBest ? t('השיא שלך: {n}', { n: prevBest }) : null
        )}
      </p>
      <SessionReward since={since} invite="game" />
      <div className="row center">
        <button className="btn" autoFocus onClick={onAgain}>{t('עוד משחק')}</button>
        <Link className="btn secondary" to="/games">{t('לכל המשחקים')}</Link>
      </div>
    </div>
  )
}
