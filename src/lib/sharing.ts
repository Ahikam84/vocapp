import { db, type Deck, type Word } from './db'
import { t } from './i18n'
import { supabase } from './sync'

/**
 * Teacher → student course sharing. The teacher publishes a snapshot of a
 * course under a short code; students add it from a link. Each student gets
 * their own copy (with their own progress), and can pull the teacher's later
 * changes with "check for updates".
 */

type SharedWord = Pick<Word, 'id' | 'term' | 'translations' | 'altTerms' | 'example' | 'exampleTranslation' | 'hint' | 'tags'>

export interface SharedCourse {
  code: string
  name: string
  sourceLang: string
  targetLang: string
  words: SharedWord[]
}

// No 0/O or 1/I, so codes are easy to read aloud and type.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join('')

export const sharedDeckId = (code: string) => `shared-${code}`
export const shareLink = (code: string) => `${location.origin}${location.pathname}#/join/${code}`

function requireClient() {
  if (!supabase) throw new Error(t('השיתוף לא זמין בגרסה הזו (חסרים פרטי Supabase).'))
  return supabase
}

/** Publish (or re-publish) a course and return its share code. */
export async function publishDeck(deck: Deck): Promise<string> {
  const client = requireClient()
  const { data: session } = await client.auth.getSession()
  if (!session.session) throw new Error(t('כדי לשתף קורס צריך להתחבר (הגדרות ← סנכרון בענן).'))

  const words: SharedWord[] = (await db.words.where('deckId').equals(deck.id).sortBy('createdAt')).map((w) => ({
    id: w.id, term: w.term, translations: w.translations, altTerms: w.altTerms,
    example: w.example, exampleTranslation: w.exampleTranslation, hint: w.hint, tags: w.tags,
  }))

  let code = deck.shareCode
  for (let attempt = 0; attempt < 5; attempt++) {
    const fresh = !code
    code ??= newCode()
    const { error } = await client.from('shared_courses').upsert({
      code, name: deck.name, source_lang: deck.sourceLang, target_lang: deck.targetLang, words,
      updated_at: new Date().toISOString(),
    })
    if (!error) {
      await db.decks.update(deck.id, { shareCode: code })
      return code
    }
    // A brand-new code that clashes with someone else's course: try another one.
    if (fresh && (error.code === '23505' || error.code === '42501')) {
      code = undefined
      continue
    }
    throw error
  }
  throw new Error(t('לא הצלחנו ליצור קוד שיתוף. נסה שוב.'))
}

export async function fetchSharedCourse(code: string): Promise<SharedCourse | null> {
  const { data, error } = await requireClient().rpc('get_shared_course', { p_code: code })
  // PGRST202: the function doesn't exist – supabase/shared-courses.sql hasn't been run yet.
  if (error?.code === 'PGRST202') throw new Error(t('שיתוף קורסים עוד לא הופעל בשרת.'))
  if (error) throw error
  const row = (data as { code: string; name: string; source_lang: string; target_lang: string; words: SharedWord[] }[])[0]
  if (!row) return null
  return { code: row.code, name: row.name, sourceLang: row.source_lang, targetLang: row.target_lang, words: row.words }
}

/**
 * Add a shared course, or bring an existing copy up to date. The teacher's
 * corrections overwrite word content; the student's "already known" marks and
 * progress are kept. Word ids are derived from the teacher's, so devices agree.
 */
export async function joinSharedCourse(course: SharedCourse): Promise<{ deckId: string; added: number; updated: number }> {
  const deckId = sharedDeckId(course.code)
  let added = 0
  let updated = 0
  await db.transaction('rw', db.decks, db.words, async () => {
    const deck = await db.decks.get(deckId)
    if (!deck)
      await db.decks.add({
        id: deckId, name: course.name, sourceLang: course.sourceLang, targetLang: course.targetLang,
        createdAt: Date.now(), sharedFrom: course.code,
      })
    else if (deck.name !== course.name) await db.decks.update(deckId, { name: course.name })

    const now = Date.now()
    for (const [i, w] of course.words.entries()) {
      const id = `${deckId}:${w.id}`
      const content = {
        term: w.term, translations: w.translations, altTerms: w.altTerms, example: w.example,
        exampleTranslation: w.exampleTranslation, hint: w.hint, tags: w.tags,
      }
      const existing = await db.words.get(id)
      if (!existing) {
        await db.words.add({ id, deckId, createdAt: now + i, ...content })
        added++
      } else if (JSON.stringify(pickContent(existing)) !== JSON.stringify(pickContent(content))) {
        await db.words.update(id, content)
        updated++
      }
    }
  })
  return { deckId, added, updated }
}

const pickContent = (w: Partial<Word>) => [w.term, w.translations, w.altTerms ?? null, w.example ?? null, w.exampleTranslation ?? null, w.hint ?? null]
