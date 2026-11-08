export type AnswerResult = 'correct' | 'almost' | 'wrong'

const HEBREW_NIKUD = /[\u0591-\u05C7]/g
const PUNCT = /[.,;:!?¿¡"'()\-–—׳״]/g
const MAQAF = /\u05BE/g
const FINAL_LETTERS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }

/** Lowercase, trim, collapse spaces, drop punctuation and Hebrew vowel marks. */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .replace(MAQAF, ' ')
    .replace(HEBREW_NIKUD, '')
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
