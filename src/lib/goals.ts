import { db, type Progress, type ReviewLog } from './db'

/**
 * Daily goal and streak. Everything is worked out from the answers and learned
 * words that are already stored (and synced), so the streak is the same on every
 * device and nothing extra has to be saved.
 */

export type GoalType = 'xp' | 'minutes' | 'answers'

export const GOAL_PRESETS: Record<GoalType, number[]> = {
  xp: [20, 50, 100, 200],
  minutes: [5, 10, 15, 20, 30],
  answers: [10, 20, 30, 50, 100],
}
export const DEFAULT_GOAL: Record<GoalType, number> = { xp: 50, minutes: 10, answers: 30 }

export const XP = { correct: 10, almost: 5, wrong: 1, learned: 15 }

/** One answer counts for at most a minute, so a phone left open doesn't fill the goal. */
const MAX_ANSWER_MS = 60_000
/** A freeze is earned for every 7 days in a row, and at most this many are kept. */
const MAX_FREEZES = 2
const DAY = 86_400_000

export interface DayActivity {
  xp: number
  minutes: number
  answers: number
}

/** Local calendar day number (days since 1970 in the user's time zone). */
export function dayKey(ts: number): number {
  return Math.floor((ts - new Date(ts).getTimezoneOffset() * 60_000) / DAY)
}

export function answerXp(r: Pick<ReviewLog, 'correct' | 'almost'>): number {
  return r.correct ? (r.almost ? XP.almost : XP.correct) : XP.wrong
}

export function activityByDay(reviews: ReviewLog[], progress: Pick<Progress, 'learnedAt'>[]): Map<number, DayActivity> {
  const days = new Map<number, DayActivity>()
  const get = (ts: number) => {
    const k = dayKey(ts)
    let d = days.get(k)
    if (!d) days.set(k, (d = { xp: 0, minutes: 0, answers: 0 }))
    return d
  }
  for (const r of reviews) {
    const d = get(r.at)
    d.xp += answerXp(r)
    d.minutes += Math.min(r.responseMs, MAX_ANSWER_MS) / 60_000
    d.answers++
  }
  for (const p of progress) get(p.learnedAt).xp += XP.learned
  return days
}

export interface Streak {
  /** Days in a row the goal was met (frozen days keep it alive but don't add to it). */
  days: number
  freezes: number
  /** Days saved by a freeze in the current streak. */
  frozen: number
  /** Longest streak ever, and how many days in total the goal was met. */
  best: number
  metDays: number
}

/**
 * Walks from the first active day to today. A day without the goal uses up a
 * freeze if there is one, otherwise the streak starts over. Today never breaks it –
 * there's still time.
 */
export function computeStreak(byDay: Map<number, DayActivity>, met: (a: DayActivity) => boolean, today: number): Streak {
  const keys = [...byDay.keys()]
  if (!keys.length) return { days: 0, freezes: 0, frozen: 0, best: 0, metDays: 0 }
  let days = 0
  let freezes = 0
  let frozen = 0
  let best = 0
  let metDays = 0
  for (let d = Math.min(...keys); d <= today; d++) {
    const a = byDay.get(d)
    if (a && met(a)) {
      days++
      metDays++
      best = Math.max(best, days)
      if (days % 7 === 0) freezes = Math.min(MAX_FREEZES, freezes + 1)
    } else if (d === today) {
      // not yet
    } else if (days > 0 && freezes > 0) {
      freezes--
      frozen++
    } else {
      days = 0
      frozen = 0
    }
  }
  return { days, freezes, frozen, best, metDays }
}

export interface DailyStatus {
  type: GoalType
  goal: number
  today: DayActivity
  /** Progress towards today's goal in the chosen unit. */
  value: number
  done: boolean
  streak: Streak
}

export function goalValue(a: DayActivity, type: GoalType): number {
  return type === 'minutes' ? Math.floor(a.minutes) : a[type]
}

/** Today's progress and the streak, across all courses. */
export async function dailyStatus(type: GoalType, goal: number): Promise<DailyStatus> {
  const since = Date.now() - 400 * DAY
  const [reviews, progress] = await Promise.all([
    db.reviews.where('at').above(since).toArray(),
    db.progress.where('learnedAt').above(since).toArray(),
  ])
  const byDay = activityByDay(reviews, progress)
  const todayKey = dayKey(Date.now())
  const today = byDay.get(todayKey) ?? { xp: 0, minutes: 0, answers: 0 }
  const met = (a: DayActivity) => goalValue(a, type) >= goal
  return { type, goal, today, value: goalValue(today, type), done: met(today), streak: computeStreak(byDay, met, todayKey) }
}

/** XP earned since a moment (for the end-of-session summary). */
export async function xpSince(ts: number): Promise<number> {
  const [reviews, progress] = await Promise.all([
    db.reviews.where('at').aboveOrEqual(ts).toArray(),
    db.progress.where('learnedAt').aboveOrEqual(ts).toArray(),
  ])
  return reviews.reduce((s, r) => s + answerXp(r), 0) + progress.length * XP.learned
}
