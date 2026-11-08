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
  const [words, allProgress, reviews] = await Promise.all([
    db.words.where('deckId').equals(deckId).toArray(),
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

  // Words marked "already known" are left out of everything except the known count.
  const knownIds = new Set(words.filter((w) => w.known).map((w) => w.id))
  const progress = allProgress.filter((p) => !knownIds.has(p.wordId))
  const learnedIds = new Set(progress.map((p) => p.wordId))

  const today = startOfToday()
  return {
    total: words.length,
    known: knownIds.size,
    learned: progress.length,
    newWords: words.filter((w) => !w.known && !learnedIds.has(w.id)).length,
    due: progress.filter((p) => p.due <= now).length,
    dueTomorrow: progress.filter((p) => p.due > now && p.due <= today + 2 * DAY).length,
    difficult: progress.filter((p) => p.lapses >= DIFFICULT_LAPSES).length,
    longTerm: progress.filter((p) => p.card.stability >= 21).length,
    learnedToday: allProgress.filter((p) => p.learnedAt >= today).length,
    answeredToday: reviews.filter((r) => r.deckId === deckId && r.at >= today).length,
    streak,
  }
}
