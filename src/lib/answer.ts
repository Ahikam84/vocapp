export type AnswerResult = 'correct' | 'almost' | 'wrong'

const HEBREW_NIKUD = /[\u0591-\u05C7]/g
const PUNCT = /[.,;:!?¿¡"'()\-–—׳״]/g
const MAQAF = /\u05BE/g
/** Arabic vowel marks, shadda and the stretching stroke: optional in writing */
export const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640]/g
const FINAL_LETTERS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }

/** Lowercase, trim, collapse spaces, drop punctuation and Hebrew vowel marks. */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .replace(MAQAF, ' ')
    .replace(HEBREW_NIKUD, '')
    .replace(ARABIC_MARKS, '')
    .replace(PUNCT, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Also strips Latin diacritics (á → a, ñ → n) and treats Hebrew final letters as regular ones (ם → מ). */
export function stripAccents(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .replace(/[ךםןףץ]/g, (c) => FINAL_LETTERS[c])
    // Arabic letters often written loosely: hamza seats, taa marbuta, alif maqsura
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
}

const ARTICLES = /^(el|la|los|las|un|una|unos|unas|l')\s+/

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/**
 * Compare a typed answer against all accepted answers.
 * - correct: identical after normalisation
 * - almost: only accents are missing, the article was left out, or a single-letter typo
 */
export function checkAnswer(input: string, accepted: string[]): { result: AnswerResult; match: string } {
  const typed = normalize(input)
  if (!typed) return { result: 'wrong', match: accepted[0] }

  for (const a of accepted) if (normalize(a) === typed) return { result: 'correct', match: a }

  const loose = (s: string) => stripAccents(normalize(s)).replace(ARTICLES, '')
  const typedLoose = loose(input)
  for (const a of accepted) {
    const target = loose(a)
    if (target === typedLoose) return { result: 'almost', match: a }
    if (target.length >= 4 && levenshtein(target, typedLoose) <= 1) return { result: 'almost', match: a }
  }
  return { result: 'wrong', match: accepted[0] }
}

const TO_FINAL: Record<string, string> = { כ: 'ך', מ: 'ם', נ: 'ן', פ: 'ף', צ: 'ץ' }

/**
 * Every spelling a typed answer may match: the word, its other accepted forms and – in a course
 * with a Hebrew transliteration – that too, with or without geresh and final letters.
 */
export function acceptedTerms(w: { term: string; altTerms?: string[]; reading?: string }): string[] {
  const out = [w.term, ...(w.altTerms ?? [])]
  if (w.reading) {
    const bare = w.reading.replace(HEBREW_NIKUD, '')
    for (const r of [bare, bare.replace(/['׳]/g, '')])
      out.push(r, r.replace(/[ךםןףץ]/g, (c) => FINAL_LETTERS[c]), r.replace(/[כמנפצ](?=$|[\s.,!?])/g, (c) => TO_FINAL[c]))
  }
  return [...new Set(out)]
}
