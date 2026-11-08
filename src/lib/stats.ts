import { db } from './db'
import { DIFFICULT_LAPSES } from './srs'

export function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const DAY = 86400000

/** Stats for the courses being studied together. */
export async function studyStats(deckIds: string[]) {
  const now = Date.now()
  const inStudy = new Set(deckIds)
  const [words, allProgress, allReviews] = await Promise.all([
    db.words.where('deckId').anyOf(deckIds).toArray(),
    db.progress.where('deckId').anyOf(deckIds).toArray(),
    db.reviews.where('at').above(now - 400 * DAY).toArray(),
  ])
  const reviews = allReviews.filter((r) => inStudy.has(r.deckId))

  // Streak: consecutive days (ending today or yesterday) with at least one answer.
  const days = new Set(reviews.map((r) => Math.floor((r.at - new Date(r.at).getTimezoneOffset() * 60000) / DAY)))
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
    answeredToday: reviews.filter((r) => r.at >= today).length,
    streak,
  }
}
