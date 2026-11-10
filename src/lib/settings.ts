import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { GoalType } from './goals'
import type { Theme } from './theme'
import { uiLang, type UiLang } from './i18n'

export interface Settings {
  wordsPerSession: number
  newPerDay: number
  reviewsPerSession: number
  autoPlayAudio: boolean
  /** Preferred voiceURI per language code; missing = pick the most natural one */
  voices: Record<string, string>
  speechRate: number
  currentDeckId: string | null
  /** Courses practised together with the current one (same language); empty = just the current course */
  studyDeckIds: string[]
  /** null = follow the browser language */
  uiLang: UiLang | null
  /** What the daily goal counts, and how much of it */
  dailyGoalType: GoalType
  dailyGoal: number
  /** Set once the user has picked a goal (in Settings or the after-first-session prompt) */
  goalChosen: boolean
  theme: Theme
  /** Medals already shown as "new" on this device; null until the first check */
  medalsSeen: string[] | null
  /** Best score per game on this device */
  gameBest: Record<string, number>
  /** Show ready-made courses translated into these languages; null = the interface language */
  courseLangs: string[] | null
}

export const DEFAULT_SETTINGS: Settings = {
  wordsPerSession: 5,
  newPerDay: 15,
  reviewsPerSession: 30,
  autoPlayAudio: true,
  voices: {},
  speechRate: 0.9,
  currentDeckId: null,
  studyDeckIds: [],
  uiLang: null,
  dailyGoalType: 'xp',
  dailyGoal: 50,
  goalChosen: false,
  theme: 'auto',
  medalsSeen: null,
  gameBest: {},
  courseLangs: null,
}

export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray()
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db.settings.put({ key, value })
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(getSettings)
}

/** Languages whose ready-made courses are shown: the user's choice, or the interface language. */
export function courseLanguages(settings: Settings): string[] {
  return settings.courseLangs?.length ? settings.courseLangs : [uiLang()]
}
