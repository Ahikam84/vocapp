import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'

export interface Settings {
  wordsPerSession: number
  newPerDay: number
  reviewsPerSession: number
  autoPlayAudio: boolean
  /** Preferred voiceURI per language code; missing = pick the most natural one */
  voices: Record<string, string>
  speechRate: number
  currentDeckId: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  wordsPerSession: 5,
  newPerDay: 15,
  reviewsPerSession: 30,
  autoPlayAudio: true,
  voices: {},
  speechRate: 0.9,
  currentDeckId: null,
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
