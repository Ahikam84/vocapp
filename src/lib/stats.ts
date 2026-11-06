import { db } from './db'
import { DIFFICULT_LAPSES } from './srs'

export function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const DAY = 86400000

export async function deckStats(deckId: string) {
  const now = Date.now()
  const [total, progress, reviews] = await Promise.all([
    db.words.where('deckId').equals(deckId).count(),
    db.progress.where('deckId').equals(deckId).toArray(),
    db.reviews.where('at').above(now - 400 * DAY).toArray(),
  ])

  // Streak: consecutive days (ending today or yesterday) with at least one answer.
  const days = new Set(reviews.filter((r) => r.deckId === deckId).map((r) => Math.floor((r.at - new Date(r.at).getTimezoneOffset() * 60000) / DAY)))
  let streak = 0
  let day = Math.floor((now - new Date().getTimezoneOffset() * 60000) / DAY)
  if (!days.has(day)) day--
  while (days.has(day)) {
    streak++
    day--
  }

  const today = startOfToday()
  return {
    total,
    learned: progress.length,
    newWords: total - progress.length,
    due: progress.filter((p) => p.due <= now).length,
    dueTomorrow: progress.filter((p) => p.due > now && p.due <= today + 2 * DAY).length,
    difficult: progress.filter((p) => p.lapses >= DIFFICULT_LAPSES).length,
    longTerm: progress.filter((p) => p.card.stability >= 21).length,
    learnedToday: progress.filter((p) => p.learnedAt >= today).length,
    answeredToday: reviews.filter((r) => r.deckId === deckId && r.at >= today).length,
    streak,
  }
}
