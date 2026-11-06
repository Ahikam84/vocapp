import type { ExerciseType, Word } from './db'

/**
 * Learning ("planting") session. Each word climbs a ladder of exercises from
 * recognition to full recall; a mistake knocks it one rung down. Words are
 * introduced gradually and interleaved so the same word never appears twice in a row.
 */
export const LADDER: ExerciseType[] = ['intro', 'choice-target', 'choice-source', 'audio-choice', 'tiles', 'typing']

export interface LearnItem {
  word: Word
  level: number
  done: boolean
}

export interface Step {
  item: LearnItem
  exercise: ExerciseType
}

export class LearnSession {
  items: LearnItem[] = []
  private waiting: Word[]
  private lastWordId: number | null = null
  private ladder: ExerciseType[]

  constructor(words: Word[], opts: { audio: boolean; choices: boolean }) {
    this.waiting = [...words]
    this.ladder = LADDER.filter(
      (t) => (opts.audio || t !== 'audio-choice') && (opts.choices || !t.startsWith('choice') && t !== 'audio-choice'),
    )
  }

  get total() {
    return this.items.length + this.waiting.length
  }

  get finished() {
    return this.waiting.length === 0 && this.items.every((i) => i.done)
  }

  /** 0..1 – share of all ladder rungs climbed by all words */
  get progress() {
    const max = this.total * this.ladder.length
    const climbed = this.items.reduce((s, i) => s + (i.done ? this.ladder.length : i.level), 0)
    return max ? climbed / max : 1
  }

  next(random = Math.random): Step | null {
    const active = this.items.filter((i) => !i.done)
    const shouldIntroduce =
      this.waiting.length > 0 && (active.length < 2 || (active.length < 4 && active.every((i) => i.level >= 2)))

    if (shouldIntroduce) {
      const item: LearnItem = { word: this.waiting.shift()!, level: 0, done: false }
      this.items.push(item)
      return this.step(item)
    }
    if (active.length === 0) return null

    // Prefer the least-advanced words, but never repeat the previous word if there is a choice.
    const candidates = active.length > 1 ? active.filter((i) => i.word.id !== this.lastWordId) : active
    candidates.sort((a, b) => a.level - b.level)
    const pool = candidates.slice(0, 2)
    return this.step(pool[Math.floor(random() * pool.length)])
  }

  private step(item: LearnItem): Step {
    this.lastWordId = item.word.id
    return { item, exercise: this.ladder[item.level] }
  }

  /** Returns true when this answer completed the word. */
  answer(item: LearnItem, correct: boolean): boolean {
    if (correct) {
      item.level++
      if (item.level >= this.ladder.length) item.done = true
    } else {
      item.level = Math.max(1, item.level - 1)
    }
    return item.done
  }
}

/** Pick wrong options that look plausible – similar length first. */
export function pickDistractors<T>(target: T, pool: T[], key: (t: T) => string, n = 3, random = Math.random): T[] {
  const targetKey = key(target)
  const others = pool.filter((p) => key(p) !== targetKey)
  const scored = others
    .map((p) => ({ p, score: Math.abs(key(p).length - targetKey.length) + random() * 4 }))
    .sort((a, b) => a.score - b.score)
  return scored.slice(0, n).map((s) => s.p)
}

export function shuffle<T>(arr: T[], random = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
