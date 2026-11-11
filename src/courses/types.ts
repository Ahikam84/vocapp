/**
 * [term, translations ("/"-separated), example, example translation,
 *  and – for languages in another script – the term's and the example's transliteration]
 */
export type CourseEntry = [string, string, string, string] | [string, string, string, string, string, string]

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

/**
 * The English version of a course taught from Hebrew: the same words and examples, with English in
 * place of the Hebrew. Per term: [translations ("/"-separated), example translation], and for Arabic
 * optionally a Latin reading of the word and the example, overriding the one derived automatically.
 */
export interface EnglishVersion {
  /** Hebrew topic name → English topic name */
  topics: Record<string, string>
  words: Record<string, [string, string] | [string, string, string, string]>
}
