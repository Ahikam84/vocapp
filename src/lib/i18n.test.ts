import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EN } from './i18n.en'

/** Every t('…') key in the source, plus keys passed through variables. */
function collectKeys(): Set<string> {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !e.name.includes('.test.') ? [join(dir, e.name)] : [],
    )
  const keys = new Set<string>()
  for (const file of files('src')) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"))
    for (const m of src.matchAll(/\bt\(\s*[\w.]+(?: === \d+)? \? '((?:[^'\\]|\\.)*)' : '((?:[^'\\]|\\.)*)'/g)) keys.add(m[2]).add(m[3])
  }
  // Keys looked up from tables (exercise prompts, word-list filters)
  for (const k of ['מילה חדשה', 'מה הפירוש?', 'איך אומרים?', 'מה שמעת?', 'הרכב את המילה', 'כתוב את המילה', 'הכל', 'חדשות', 'נלמדו', 'קשות', 'מוכרות'])
    keys.add(k)
  return keys
}

describe('English UI', () => {
  it('has a translation for every Hebrew UI string', () => {
    const missing = [...collectKeys()].filter((k) => /[֐-׿]/.test(k) && !(k in EN))
    expect(missing).toEqual([])
  })

  it('keeps the same {placeholders} in translations', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [he, en] of Object.entries(EN)) expect(vars(en), he).toEqual(vars(he))
  })
})
