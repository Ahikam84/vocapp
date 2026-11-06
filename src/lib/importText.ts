export interface ParsedWord {
  term: string
  translations: string[]
  example?: string
  exampleTranslation?: string
  hint?: string
}

const HEBREW = /[֐-׿]/

/**
 * Parse pasted lines or CSV. Each line: term <sep> translation [<sep> example <sep> example translation <sep> hint]
 * Separators: tab, ";", ",", " - ", " = ". Multiple translations inside a field are split by "/".
 * If the Hebrew side comes first it is swapped automatically.
 */
export function parseWordList(text: string): ParsedWord[] {
  const out: ParsedWord[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : / [-–=] /.test(line) ? / [-–=] / : ','
    let fields = line.split(sep).map((f) => f.trim().replace(/^"|"$/g, ''))
    if (fields.length < 2 || !fields[0] || !fields[1]) continue
    if (HEBREW.test(fields[0]) && !HEBREW.test(fields[1])) fields = [fields[1], fields[0], ...fields.slice(2)]
    out.push({
      term: fields[0],
      translations: fields[1].split('/').map((t) => t.trim()).filter(Boolean),
      example: fields[2] || undefined,
      exampleTranslation: fields[3] || undefined,
      hint: fields[4] || undefined,
    })
  }
  return out
}
