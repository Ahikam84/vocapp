import { normalize, stripAccents } from './answer'
import { db, newId, type ExerciseType, type Word } from './db'
import { pickDistractors } from './session'
import { getSettings, setSetting } from './settings'

/** Word games: quick, playful practice with words that have already been learned. */
export type GameId = 'pairs' | 'falling' | 'cloze' | 'plant' | 'gender' | 'memory' | 'odd' | 'listen' | 'truefalse'

/** Games where a lower score is better (memory counts moves) */
export const LOWER_IS_BETTER: GameId[] = ['memory']

export const MIN_GAME_WORDS = 6

/** Learned words (not marked known) from the courses being studied. */
export async function loadGameWords(deckIds: string[]): Promise<Word[]> {
  const [words, progress] = await Promise.all([
    db.words.where('deckId').anyOf(deckIds).toArray(),
    db.progress.where('deckId').anyOf(deckIds).toArray(),
  ])
  const learned = new Set(progress.map((p) => p.wordId))
  return words.filter((w) => learned.has(w.id) && !w.known)
}

const EXERCISE: Record<GameId, ExerciseType> = {
  pairs: 'choice-target', falling: 'typing', cloze: 'choice-target', plant: 'tiles', gender: 'choice-target', memory: 'choice-target', odd: 'choice-source', listen: 'audio-choice', truefalse: 'choice-source',
}

/** Each answer counts towards the daily goal (a few XP) but leaves the review schedule alone. */
export async function logGameAnswer(game: GameId, word: Word, correct: boolean, responseMs: number, almost = false) {
  await db.reviews.add({
    id: newId(),
    wordId: word.id,
    deckId: word.deckId,
    mode: 'game',
    exercise: EXERCISE[game],
    correct,
    almost,
    responseMs: Math.round(Math.min(responseMs, 60_000)),
    at: Date.now(),
  })
}

/** Whether `score` beats `prev` (0 = no score yet). */
export function isRecord(game: GameId, score: number, prev: number): boolean {
  if (LOWER_IS_BETTER.includes(game)) return score > 0 && (prev === 0 || score < prev)
  return score > prev
}

/** Saves the score if it beats the best so far; returns the previous best (0 = none). */
export async function recordScore(game: GameId, score: number): Promise<number> {
  const { gameBest } = await getSettings()
  const prev = gameBest[game] ?? 0
  if (isRecord(game, score, prev)) await setSetting('gameBest', { ...gameBest, [game]: score })
  return prev
}

// ---- Odd one out -------------------------------------------------------------

/** Learned words by topic (the ready-made courses tag each word with its topic). */
export function topicGroups(words: Word[]): Map<string, Word[]> {
  const groups = new Map<string, Word[]>()
  for (const w of words) {
    const topic = w.tags?.[0]
    if (!topic) continue
    groups.set(topic, [...(groups.get(topic) ?? []), w])
  }
  return groups
}

export interface OddQuestion {
  words: Word[]
  odd: Word
  /** The topic the other three share, and the odd one's topic */
  topic: string
  oddTopic: string
}

/** Three words from one topic and one from another, shuffled; null when the topics don't allow it. */
export function oddQuestion(groups: Map<string, Word[]>, random = Math.random): OddQuestion | null {
  const topics = [...groups.keys()]
  const big = topics.filter((k) => groups.get(k)!.length >= 3)
  if (!big.length || topics.length < 2) return null
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)]
  const topic = pick(big)
  const oddTopic = pick(topics.filter((k) => k !== topic))
  const three = shuffled(groups.get(topic)!).slice(0, 3)
  const odd = pick(groups.get(oddTopic)!)
  return { words: shuffled([...three, odd]), odd, topic, oddTopic }
}

export function shuffled<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---- Complete the sentence ------------------------------------------------

export interface Cloze {
  word: Word
  before: string
  /** The word as it appears in the sentence (what fills the blank) */
  answer: string
  after: string
  /** Whether the blank is the word without its article (so the options drop theirs too) */
  bare: boolean
}

const ARTICLE = /^(el|la|los|las|un|una|le|les|l'|der|die|das|o|a|os|as|il|lo|gli|the|a|an)\s+/i
export const withoutArticle = (term: string) => term.replace(ARTICLE, '')

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The word's example sentence with the word cut out, or null when the word isn't in it as written. */
export function clozeFor(word: Word): Cloze | null {
  if (!word.example) return null
  const forms = [word.term, ...(word.altTerms ?? [])].flatMap((f) => [f, withoutArticle(f)])
  for (const form of [...new Set(forms)].sort((a, b) => b.length - a.length)) {
    if (form.length < 2) continue
    const m = new RegExp(`(^|[^\\p{L}])(${escapeRe(form)})(?=$|[^\\p{L}])`, 'iu').exec(word.example)
    if (!m) continue
    const start = m.index + m[1].length
    return {
      word,
      before: word.example.slice(0, start),
      answer: word.example.slice(start, start + m[2].length),
      after: word.example.slice(start + m[2].length),
      bare: form === withoutArticle(form) && form !== word.term,
    }
  }
  return null
}

/** Four ways to fill the blank: the answer and three other learned words, shaped like it. */
export function clozeOptions(item: Cloze, pool: Word[]): string[] {
  const shape = (w: Word) => {
    const s = item.bare ? withoutArticle(w.term) : w.term
    return item.answer[0] === item.answer[0].toUpperCase() && item.answer[0] !== item.answer[0].toLowerCase()
      ? s[0].toUpperCase() + s.slice(1)
      : s
  }
  const others = pickDistractors(item.word, pool, (w) => shape(w).toLowerCase(), 3).map(shape)
  return shuffled([...new Set([item.answer, ...others.filter((o) => o.toLowerCase() !== item.answer.toLowerCase())])])
}

// ---- el or la? -------------------------------------------------------------

/** "el perro" → { article: 'el', noun: 'perro' }; null for words without a singular el/la. */
export function genderOf(word: Word): { article: 'el' | 'la'; noun: string } | null {
  const m = /^(el|la)\s+(.+)$/i.exec(word.term.trim())
  return m ? { article: m[1].toLowerCase() as 'el' | 'la', noun: m[2] } : null
}

// ---- Save the plant (letter guessing) -------------------------------------

const HEBREW_ALPHABET = [...'אבגדהוזחטיכלמנסעפצקרשת']
const LATIN_ALPHABET = [...'abcdefghijklmnopqrstuvwxyz']

/** Letters to guess from: the language's alphabet (accents and final forms count as the base letter). */
export function alphabetFor(lang: string, words: Word[]): string[] {
  if (lang === 'he') return HEBREW_ALPHABET
  if (['es', 'ca', 'fr', 'it', 'de', 'pt', 'en'].includes(lang)) return LATIN_ALPHABET
  const letters = new Set(words.flatMap((w) => [...baseLetters(w.term)]).filter((c) => /\p{L}/u.test(c)))
  return [...letters].sort()
}

/** Lower-case, accents removed, Hebrew final letters as regular ones. */
export function baseLetters(s: string): string {
  return stripAccents(s.toLowerCase())
}

// ---- Listening -------------------------------------------------------------

const meaning = (w: Word) => normalize(w.translations[0] ?? '')

/** The word's meaning and up to three others, shuffled; none share a meaning or spelling with the word. */
export function listenOptions(word: Word, pool: Word[], random = Math.random): Word[] {
  const own = new Set(word.translations.map(normalize))
  const others = pool.filter((w) => w.id !== word.id && !own.has(meaning(w)) && normalize(w.term) !== normalize(word.term))
  // one option per meaning
  const unique = [...new Map(others.map((w) => [meaning(w), w])).values()]
  return shuffled([word, ...pickDistractors(word, unique, meaning, 3, random)])
}

// ---- True or false ---------------------------------------------------------

export interface TrueFalse {
  word: Word
  /** The translation shown next to the word */
  shown: string
  truth: boolean
}

/** The word with its own translation, or (about half the time) another word's. */
export function trueFalseFor(word: Word, pool: Word[], random = Math.random): TrueFalse {
  const own = new Set(word.translations.map(normalize))
  const wrong = pool.filter((w) => w.id !== word.id && !own.has(meaning(w)))
  if (!wrong.length || random() < 0.5) return { word, shown: word.translations[0], truth: true }
  const [other] = pickDistractors(word, wrong, meaning, 1, random)
  return { word, shown: other.translations[0], truth: false }
}
