/**
 * Latin transliteration of spoken Arabic, derived from the courses' fully vowelled Hebrew
 * transliteration – so the English and Hebrew versions of a course always agree.
 *
 *   הַלַּא → halla   בִּדִּי → biddi   ח'לַאץ → khalas   בַּעְדֵין → ba'dein   כִּיפַכּ → kifak
 *
 * ' marks ע (ain) and a glottal stop. In these transliterations a dagesh in בּ / כּ only
 * tells the letter apart (b, k) and does not double it; in any other letter it marks a shadda.
 */

const GERESH = /['׳]/
const POINTS = /[ְ-ׇּׁׂ]/

const BASE: Record<string, string> = {
  א: '', ב: 'b', ג: 'g', ד: 'd', ה: 'h', ו: 'w', ז: 'z', ח: 'h', ט: 't', י: 'y',
  כ: 'k', ך: 'k', ל: 'l', מ: 'm', ם: 'm', נ: 'n', ן: 'n', ס: 's', ע: "'", פ: 'f', ף: 'f',
  צ: 's', ץ: 's', ק: 'q', ר: 'r', ש: 'sh', ת: 't',
}
const WITH_GERESH: Record<string, string> = {
  ג: 'j', ח: 'kh', ך: 'kh', כ: 'kh', ע: 'gh', ת: 'th', ד: 'dh', צ: 'd', ץ: 'd', ט: 'z', ז: 'zh',
}
const VOWEL: Record<string, string> = {
  'ַ': 'a', 'ָ': 'a', 'ִ': 'i', 'ֵ': 'e', 'ֶ': 'e', 'ֻ': 'u', 'ֹ': 'o', 'ֺ': 'o',
  'ֲ': 'a', 'ֱ': 'e', 'ֳ': 'o',
}
const DAGESH = 'ּ'

export interface Letter {
  ch: string
  geresh: boolean
  dagesh: boolean
  vowel: string // '' = none, 'shva' = shva
}

export function parseWord(word: string): (Letter | string)[] {
  const out: (Letter | string)[] = []
  for (const c of word) {
    const last = out[out.length - 1]
    if (BASE[c] !== undefined) out.push({ ch: c, geresh: false, dagesh: false, vowel: '' })
    else if (typeof last === 'object' && GERESH.test(c)) last.geresh = true
    else if (typeof last === 'object' && POINTS.test(c)) {
      if (c === DAGESH) last.dagesh = true
      else if (c === 'ְ') last.vowel = 'shva'
      else if (VOWEL[c]) last.vowel = VOWEL[c]
    } else out.push(c)
  }
  return out
}

function word(w: string): string {
  const letters = parseWord(w)
  let out = ''
  for (let i = 0; i < letters.length; i++) {
    const l = letters[i]
    if (typeof l === 'string') {
      out += l
      continue
    }
    const prev = letters[i - 1]
    const prevLetter = typeof prev === 'object' ? prev : null
    const prevVowel = prevLetter && prevLetter.vowel && prevLetter.vowel !== 'shva' ? prevLetter.vowel : ''
    const next = letters[i + 1]
    const atEnd = !next || typeof next === 'string'
    const vowel = l.vowel === 'shva' ? '' : l.vowel

    // Vav: וּ is u (or w after a vowel, as in לַוּ = law), וֹ is o; with a vowel of its own it is w.
    if (l.ch === 'ו') {
      // …and "w" before a vowel at the start of a word: וּאִנְכַּסְרַת = winkasrat.
      const nextIsVowelAlef = typeof next === 'object' && next.ch === 'א' && next.vowel && next.vowel !== 'shva'
      if (l.dagesh && !l.vowel) { out += prevVowel || (!prevLetter && nextIsVowelAlef) ? 'w' : 'u'; continue }
      if (l.vowel === 'o' && !l.dagesh) { out += prevLetter && !prevVowel ? 'o' : 'wo'; continue }
      out += (l.dagesh && prevVowel ? 'ww' : 'w') + vowel
      continue
    }
    // Yod without points: the long vowel after i / e / a (פִי = fi, בֵּית = beit, שַאי = shai).
    const nextIsVowelVav = typeof next === 'object' && next.ch === 'ו' && (next.dagesh || next.vowel === 'o') && !atEnd
    if (l.ch === 'י' && !l.vowel && !l.dagesh && prevLetter && prevVowel && !nextIsVowelVav) {
      out += prevVowel === 'i' ? '' : 'i'
      continue
    }
    // Alef: carries a vowel at the start of a word, lengthens one after a vowel, else a glottal stop.
    if (l.ch === 'א') {
      if (!l.vowel) { out += prevLetter && !prevVowel ? "'" : ''; continue }
      const afterInitialW = prevLetter?.ch === 'ו' && prevLetter.dagesh && i === 1
      const afterCarrier = prevLetter?.ch === 'א' && !prevLetter.vowel // تفاءل: תְפַאאַל = tfa'al
      out += (prevLetter && !afterInitialW && (prevVowel || afterCarrier || prevLetter.vowel === 'shva') ? "'" : '') + vowel
      continue
    }
    // Final ה after a vowel is the silent feminine ending (عيلة = eile).
    if (l.ch === 'ה' && !l.vowel && atEnd && prevVowel) continue

    const sound = l.geresh && WITH_GERESH[l.ch] ? WITH_GERESH[l.ch] : BASE[l.ch]
    const doubled = l.dagesh && prevVowel && l.ch !== 'ב' && l.ch !== 'כ' && l.ch !== 'ך'
    out += (doubled ? sound + sound : sound) + vowel
  }
  return out
}

export function hebrewToLatin(hebrew: string): string {
  return hebrew.normalize('NFC').split(/(\s+)/).map((part) => (/\s/.test(part) ? part : word(part))).join('')
}

// --- Fully vowelled Arabic, for the voice only -------------------------------------------------
// Unvowelled Arabic is ambiguous to a speech engine (لمس: lamas "touched" or lams "touch"), so clips
// are generated from a vowelled spelling rebuilt from the Hebrew transliteration, which already
// spells out the spoken pronunciation. The course keeps showing the plain spelling.

const AR: Record<string, string> = {
  ב: 'ب', ג: 'ج', ד: 'د', ה: 'ه', ו: 'و', ז: 'ز', ח: 'ح', ט: 'ط', י: 'ي', כ: 'ك', ך: 'ك',
  ל: 'ل', מ: 'م', ם: 'م', נ: 'ن', ן: 'ن', ס: 'س', ע: 'ع', פ: 'ف', ף: 'ف', צ: 'ص', ץ: 'ص', ק: 'ق',
  ר: 'ر', ש: 'ش', ת: 'ت',
}
const AR_GERESH: Record<string, string> = {
  ג: 'ج', ח: 'خ', כ: 'خ', ך: 'خ', ע: 'غ', ת: 'ث', ד: 'ذ', צ: 'ض', ץ: 'ض', ט: 'ظ', ז: 'ج',
}
const FATHA = 'َ', KASRA = 'ِ', DAMMA = 'ُ', SUKUN = 'ْ', SHADDA = 'ّ'
const HARAKA: Record<string, string> = { a: FATHA, i: KASRA, e: KASRA, u: DAMMA, o: DAMMA, shva: SUKUN }

/** How the "-e/-a" feminine ending (ة) is written for the voice – kept switchable to compare by ear. */
export type TaMarbuta = 'kasra' | 'fatha' | 'bare' | 'ha' | 'bareha' | 'fathaha' | 'plain' | 'kasraend' | 'spoken'

function vowelledWord(w: string, ta: TaMarbuta): string {
  const letters = parseWord(w)
  let out = ''
  for (let i = 0; i < letters.length; i++) {
    const l = letters[i]
    if (typeof l === 'string') {
      out += l === '-' ? '' : l === '?' ? '؟' : l === ',' ? '،' : l
      continue
    }
    const prev = letters[i - 1]
    const prevLetter = typeof prev === 'object' ? prev : null
    const prevVowel = prevLetter && prevLetter.vowel && prevLetter.vowel !== 'shva' ? prevLetter.vowel : ''
    const next = letters[i + 1]
    const nextLetter = typeof next === 'object' ? next : null
    const atEnd = !nextLetter
    // e before an unpointed yod is the diphthong "ei" (בֵּית = bayt), written fatha + ي.
    const beforeDiphthong = nextLetter?.ch === 'י' && !nextLetter.vowel && !nextLetter.dagesh
    const mark = (v: string) => (v === 'e' && beforeDiphthong ? FATHA : HARAKA[v] ?? '')

    if (l.ch === 'ו') {
      if (l.dagesh && !l.vowel) { out += prevVowel ? 'و' + SUKUN : (prevLetter ? DAMMA : '') + 'و'; continue }
      if (l.vowel === 'o' && !l.dagesh) { out += (prevLetter && !prevVowel ? DAMMA : prevLetter ? '' : 'أُ') + 'و'; continue }
      out += 'و' + (l.dagesh && prevVowel ? SHADDA : '') + mark(l.vowel)
      continue
    }
    if (l.ch === 'י' && !l.vowel && !l.dagesh && prevLetter && prevVowel) {
      out += prevVowel === 'i' ? 'ي' : 'ي' + SUKUN
      continue
    }
    if (l.ch === 'א') {
      if (!l.vowel) { out += prevVowel ? 'ا' : prevLetter ? 'ء' : 'أ'; continue } // אוֹ at the start: أُو
      const seat = l.vowel === 'i' || l.vowel === 'e' ? 'إ' : 'أ'
      out += seat + mark(l.vowel)
      continue
    }
    if (l.ch === 'ה' && !l.vowel && atEnd && prevVowel) {
      // The letter before already got its mark; adjust it to the chosen way of writing the ending.
      const last = out.slice(-1)
      if (last === KASRA || last === FATHA) {
        if (ta === 'fatha') out = out.slice(0, -1) + FATHA
        if (ta === 'bare') out = out.slice(0, -1)
        if (ta === 'ha' && last === KASRA) { out += 'ه'; continue }
        // ه as in informal Levantine writing (جبنه), with no mark or a fatha before it
        if (ta === 'bareha') { out = out.slice(0, -1) + 'ه'; continue }
        if (ta === 'fathaha') { out = out.slice(0, -1) + FATHA + 'ه'; continue }
        // no letter at all after the kasra (جِبْنِ): a short final vowel, which may come out as "-e"
        if (ta === 'kasraend') { out = out.slice(0, -1) + KASRA; continue }
        // The rule used: no ة at all, which the voice tends to read as -a or -ah – just the
        // ending's own vowel, a fatha for "-a" (سَيَّارَ) and a kasra for "-e" (جِبْنِ).
        if (ta === 'spoken') continue
      }
      out += 'ة'
      continue
    }

    const letter = l.geresh && AR_GERESH[l.ch] ? AR_GERESH[l.ch] : AR[l.ch] ?? ''
    const doubled = l.dagesh && prevVowel && l.ch !== 'ב' && l.ch !== 'כ' && l.ch !== 'ך'
    out += letter + (doubled ? SHADDA : '') + mark(l.vowel)
  }
  return out
}

/** Fully vowelled Arabic rebuilt from a Hebrew transliteration: לַמַס → لَمَس, בֵּית → بَيْت, גִ'בְּנֵה → جِبْنِ. */
export function hebrewToVowelledArabic(hebrew: string, ta: TaMarbuta = 'spoken'): string {
  return hebrew.normalize('NFC').split(/(\s+)/).map((part) => (/\s/.test(part) ? part : vowelledWord(part, ta))).join('')
}
