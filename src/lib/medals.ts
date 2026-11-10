import { db, type Deck, type Progress, type ReviewLog, type Word } from './db'
import { activityByDay, computeStreak, dayKey, goalValue, type GoalType } from './goals'
import { t } from './i18n'

/**
 * Achievements. Every medal is worked out from data the app already keeps
 * (answers, learned words, the streak), so they match on every device.
 */

export type Tier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'special'
export type MedalIcon = 'sprout' | 'brain' | 'flame' | 'target' | 'check' | 'sparkles' | 'moon' | 'sunrise' | 'graduation' | 'globe'

export type MedalGroup = 'learned' | 'longterm' | 'streak' | 'goal' | 'answers' | 'special'

export interface Medal {
  id: string
  /** Topic: one of the four-tier tracks, or a one-off special medal */
  group: MedalGroup
  icon: MedalIcon
  tier: Tier
  title: string
  description: string
  /** Progress towards it: value / target */
  value: number
  target: number
  earned: boolean
  /** What's left for this medal, or – on the highest earned one – for the next tier */
  hint?: string
}

export interface MedalData {
  reviews: Pick<ReviewLog, 'correct' | 'almost' | 'responseMs' | 'at'>[]
  progress: Pick<Progress, 'wordId' | 'deckId' | 'learnedAt' | 'card'>[]
  words: Pick<Word, 'id' | 'deckId' | 'known'>[]
  decks: Pick<Deck, 'id' | 'targetLang'>[]
  goalType: GoalType
  goal: number
  /** For tests: "now" */
  now?: number
}

/** Every ladder has four steps: bronze → silver → gold → diamond. */
const TIER_ORDER: Tier[] = ['bronze', 'silver', 'gold', 'diamond']
type Steps = [number, number, number, number]

function tierMedalName(tier: Tier): string {
  return tier === 'bronze' ? t('מדליית ארד') : tier === 'silver' ? t('מדליית כסף') : tier === 'gold' ? t('מדליית זהב') : t('מדליית יהלום')
}

/**
 * `value` decides what's earned; `current` is where the learner stands now, for
 * "what's left" (they differ for streaks: medals go by the record, the next one needs the current streak).
 */
function ladder(
  id: Exclude<MedalGroup, 'special'>,
  icon: MedalIcon,
  steps: Steps,
  value: number,
  title: (n: number) => string,
  description: (n: number) => string,
  left: (n: number, medal: string) => string,
  current = value,
): Medal[] {
  const more = (i: number) => left(Math.max(1, steps[i] - current), tierMedalName(TIER_ORDER[i]))
  const top = steps.filter((n) => value >= n).length - 1 // index of the highest earned step, -1 if none
  return steps.map((n, i) => ({
    id: `${id}-${n}`,
    group: id,
    icon,
    tier: TIER_ORDER[i],
    title: title(n),
    description: description(n),
    value: Math.min(value, n),
    target: n,
    earned: value >= n,
    hint: i > top ? more(i) : i === top ? (steps[i + 1] ? more(i + 1) : t('הגעת לדרגה הגבוהה ביותר!')) : undefined,
  }))
}

function single(id: string, icon: MedalIcon, earned: boolean, title: string, description: string): Medal {
  return { id, group: 'special', icon, tier: 'special', title, description, value: earned ? 1 : 0, target: 1, earned }
}

export function evaluateMedals(d: MedalData): Medal[] {
  const now = d.now ?? Date.now()
  const knownIds = new Set(d.words.filter((w) => w.known).map((w) => w.id))
  const learned = d.progress.filter((p) => !knownIds.has(p.wordId))
  const longTerm = learned.filter((p) => p.card.stability >= 21).length

  const byDay = activityByDay(d.reviews as ReviewLog[], d.progress)
  const streak = computeStreak(byDay, (a) => goalValue(a, d.goalType) >= d.goal, dayKey(now))

  // A day with at least 20 answers and not a single mistake
  const perDay = new Map<number, { n: number; wrong: number }>()
  for (const r of d.reviews) {
    const k = dayKey(r.at)
    const day = perDay.get(k) ?? { n: 0, wrong: 0 }
    day.n++
    if (!r.correct) day.wrong++
    perDay.set(k, day)
  }
  const perfectDay = [...perDay.values()].some((x) => x.n >= 20 && x.wrong === 0)
  const hours = d.reviews.map((r) => new Date(r.at).getHours())
  const nightOwl = hours.some((h) => h >= 23 || h < 3)
  const earlyBird = hours.some((h) => h >= 4 && h < 7)

  // A course is finished when every one of its words (20+) is learned or marked known
  const learnedIds = new Set(learned.map((p) => p.wordId))
  const perDeck = new Map<string, { total: number; done: number }>()
  for (const w of d.words) {
    const x = perDeck.get(w.deckId) ?? { total: 0, done: 0 }
    x.total++
    if (w.known || learnedIds.has(w.id)) x.done++
    perDeck.set(w.deckId, x)
  }
  const finished = [...perDeck.values()].filter((x) => x.total >= 20 && x.done === x.total).length

  const langOf = new Map(d.decks.map((x) => [x.id, x.targetLang]))
  const languages = new Set(learned.map((p) => langOf.get(p.deckId)).filter(Boolean)).size

  return [
    ...ladder('learned', 'sprout', [10, 100, 500, 1000], learned.length,
      (n) => t('{n} מילים', { n }), (n) => t('למדת {n} מילים חדשות', { n }),
      (n, medal) => (n === 1 ? t('עוד מילה אחת ל{medal}', { medal }) : t('עוד {n} מילים ל{medal}', { n, medal }))),
    ...ladder('longterm', 'brain', [10, 50, 200, 500], longTerm,
      (n) => t('זיכרון ארוך · {n}', { n }), (n) => t('{n} מילים הגיעו לזיכרון ארוך', { n }),
      (n, medal) => (n === 1 ? t('עוד מילה אחת בזיכרון ארוך ל{medal}', { medal }) : t('עוד {n} מילים בזיכרון ארוך ל{medal}', { n, medal }))),
    ...ladder('streak', 'flame', [3, 7, 30, 100], streak.best,
      (n) => t('{n} ימים ברצף', { n }), (n) => t('עמדת ביעד היומי {n} ימים ברצף', { n }),
      (n, medal) => (n === 1 ? t('עוד יום אחד ברצף ל{medal}', { medal }) : t('עוד {n} ימים ברצף ל{medal}', { n, medal })),
      streak.days),
    ...ladder('goal', 'target', [1, 10, 50, 100], streak.metDays,
      (n) => (n === 1 ? t('יעד ראשון') : t('{n} ימי יעד', { n })),
      (n) => (n === 1 ? t('עמדת ביעד היומי בפעם הראשונה') : t('עמדת ביעד היומי ב-{n} ימים', { n })),
      (n, medal) => (n === 1 ? t('עוד יום יעד אחד ל{medal}', { medal }) : t('עוד {n} ימי יעד ל{medal}', { n, medal }))),
    ...ladder('answers', 'check', [100, 1000, 5000, 10000], d.reviews.length,
      (n) => t('{n} תשובות', { n }), (n) => t('ענית על {n} שאלות', { n }),
      (n, medal) => (n === 1 ? t('עוד תשובה אחת ל{medal}', { medal }) : t('עוד {n} תשובות ל{medal}', { n, medal }))),
    single('perfect-day', 'sparkles', perfectDay, t('יום מושלם'), t('20 תשובות או יותר ביום אחד, בלי אף טעות')),
    single('night-owl', 'moon', nightOwl, t('ינשוף לילה'), t('תרגלת אחרי 23:00')),
    single('early-bird', 'sunrise', earlyBird, t('ציפור מוקדמת'), t('תרגלת לפני 7:00 בבוקר')),
    single('course-done', 'graduation', finished > 0, t('סיימת קורס'), t('למדת את כל המילים בקורס')),
    single('polyglot', 'globe', languages >= 2, t('רב-לשוני'), t('למדת מילים בשתי שפות או יותר')),
  ]
}

export async function loadMedals(goalType: GoalType, goal: number): Promise<Medal[]> {
  const [reviews, progress, words, decks] = await Promise.all([
    db.reviews.toArray(),
    db.progress.toArray(),
    db.words.toArray(),
    db.decks.toArray(),
  ])
  return evaluateMedals({ reviews, progress, words, decks, goalType, goal })
}
