/** [term, translations ("/"-separated), example, example translation] */
export type CourseEntry = [string, string, string, string]

/** Entries grouped by topic; the topic becomes the word's tag. */
export type CourseWords = Record<string, CourseEntry[]>

export interface CourseInfo {
  /** Stable id – also the prefix of every word id, so devices agree on them */
  id: string
  name: string
  description: string
  level: string
  sourceLang: string
  targetLang: string
  load: () => Promise<CourseWords>
}
