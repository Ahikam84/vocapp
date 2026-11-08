import { EN } from './i18n.en'

/**
 * UI translation. The Hebrew text is the key, so the Hebrew UI needs no
 * dictionary and the code stays readable; English comes from i18n.en.ts.
 * Placeholders look like {n} and are filled from `vars`.
 */
export type UiLang = 'he' | 'en'

export function detectUiLang(): UiLang {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('he') ? 'he' : 'en'
}

let current: UiLang = detectUiLang()

export function setUiLang(lang: UiLang) {
  current = lang
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
  }
}

export const uiLang = () => current

export function t(he: string, vars?: Record<string, string | number>): string {
  let s = current === 'en' ? (EN[he] ?? he) : he
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

/** Locale for dates and times in the current UI language. */
export const uiLocale = () => (current === 'he' ? 'he-IL' : 'en-GB')

const LANGUAGE_NAMES: Record<UiLang, Record<string, string>> = {
  he: {
    es: 'ספרדית', ca: 'קטלאנית', he: 'עברית', en: 'אנגלית', fr: 'צרפתית',
    it: 'איטלקית', de: 'גרמנית', pt: 'פורטוגזית', ar: 'ערבית',
  },
  en: {
    es: 'Spanish', ca: 'Catalan', he: 'Hebrew', en: 'English', fr: 'French',
    it: 'Italian', de: 'German', pt: 'Portuguese', ar: 'Arabic',
  },
}

/** Languages that can be learned, in menu order. */
export const LEARNABLE = ['es', 'he', 'ca', 'en', 'fr', 'it', 'de', 'pt', 'ar']

export const langName = (code: string) => LANGUAGE_NAMES[current][code] ?? code

const RTL = new Set(['he', 'ar'])
export const dirOf = (lang: string): 'rtl' | 'ltr' => (RTL.has(lang) ? 'rtl' : 'ltr')
