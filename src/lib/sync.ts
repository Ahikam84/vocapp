import { createClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { db, markRemote, reviveCard, setLocalChangeListener, SYNCED_TABLES, type SyncedTable } from './db'

/**
 * Offline-first cloud sync. The local IndexedDB stays the source the app reads
 * from; this module pushes local changes to Supabase and pulls changes made on
 * other devices. Conflicts resolve as last-write-wins on the device timestamp.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabase = url && key ? createClient(url, key) : null

const PRIMARY_KEY: Record<SyncedTable, string> = { decks: 'id', words: 'id', progress: 'wordId', reviews: 'id' }
const BATCH = 500

export interface RemoteRow {
  tbl: SyncedTable
  id: string
  data: Record<string, unknown> | null
  deleted: boolean
  client_updated_at: number
  seq: number
}

// ---- status store -------------------------------------------------------

export interface SyncStatus {
  state: 'disabled' | 'signed-out' | 'idle' | 'syncing' | 'error'
  email?: string
  lastSync?: number
  error?: string
}

let status: SyncStatus = { state: supabase ? 'signed-out' : 'disabled' }
const listeners = new Set<() => void>()
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => status,
  )
}

// ---- cursors ------------------------------------------------------------

async function getMeta(name: string): Promise<number> {
  return ((await db.settings.get(`sync:${name}`))?.value as number) ?? 0
}
async function setMeta(name: string, value: unknown) {
  await db.settings.put({ key: `sync:${name}`, value })
}

// ---- push / pull --------------------------------------------------------

async function push(userId: string) {
  const startedAt = Date.now()
  const since = await getMeta('pushedAt')
  const rows: (Omit<RemoteRow, 'seq'> & { user_id: string })[] = []

  for (const tbl of SYNCED_TABLES) {
    const changed = await db.table(tbl).where('updatedAt').above(since).toArray()
    for (const item of changed)
      rows.push({
        user_id: userId, tbl, id: String(item[PRIMARY_KEY[tbl]]), data: item, deleted: false,
        client_updated_at: item.updatedAt,
      })
  }
  for (const t of await db.tombstones.where('updatedAt').above(since).toArray())
    rows.push({ user_id: userId, tbl: t.tbl, id: t.id, data: null, deleted: true, client_updated_at: t.updatedAt })

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase!.from('records').upsert(rows.slice(i, i + BATCH), { onConflict: 'user_id,tbl,id' })
    if (error) throw error
  }
  // Anything changed while we were pushing has updatedAt >= startedAt and goes next time.
  await setMeta('pushedAt', startedAt - 1)
  await db.tombstones.where('updatedAt').below(startedAt - 1).delete()
}

/** Apply rows pulled from the cloud, skipping any the device has changed more recently. */
export async function applyRemote(rows: RemoteRow[]) {
  await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.tombstones], async (tx) => {
    markRemote(tx)
    for (const row of rows) {
      const table = db.table(row.tbl)
      const local = await table.get(row.id)
      const tomb = await db.tombstones.get(`${row.tbl}:${row.id}`)
      const localTime = Math.max(local?.updatedAt ?? 0, tomb?.updatedAt ?? 0)
      if ((local || tomb) && localTime > row.client_updated_at) continue

      if (row.deleted || !row.data) {
        await table.delete(row.id)
      } else {
        const data: Record<string, unknown> = { ...row.data, updatedAt: row.client_updated_at }
        if (row.tbl === 'progress') data.card = reviveCard(data.card as never)
        await table.put(data)
      }
      if (tomb) await db.tombstones.delete(tomb.key)
    }
  })
}

async function pull() {
  let cursor = await getMeta('pulledSeq')
  for (;;) {
    const { data, error } = await supabase!
      .from('records')
      .select('tbl,id,data,deleted,client_updated_at,seq')
      .gt('seq', cursor)
      .order('seq')
      .limit(1000)
    if (error) throw error
    if (!data.length) return
    await applyRemote(data as RemoteRow[])
    cursor = data[data.length - 1].seq
    await setMeta('pulledSeq', cursor)
    if (data.length < 1000) return
  }
}

// ---- scheduling ---------------------------------------------------------

let running: Promise<void> | null = null
let again = false
let timer: ReturnType<typeof setTimeout> | undefined

export async function syncNow(): Promise<void> {
  if (!supabase) return
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) return setStatus({ state: 'signed-out', email: undefined })

      // Switching accounts: start over so this device's data goes to the new account.
      if ((await db.settings.get('sync:userId'))?.value !== user.id) {
        await setMeta('pushedAt', 0)
        await setMeta('pulledSeq', 0)
        await setMeta('userId', user.id)
      }
      setStatus({ state: 'syncing', email: user.email })
      await pull()
      await push(user.id)
      setStatus({ state: 'idle', lastSync: Date.now(), error: undefined })
    } catch (e) {
      const message = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e)
      setStatus({ state: 'error', error: navigator.onLine ? message : 'אין חיבור לאינטרנט' })
    } finally {
      running = null
      if (again) {
        again = false
        scheduleSync()
      }
    }
  })()
  return running
}

export function scheduleSync(delay = 3000) {
  if (!supabase) return
  clearTimeout(timer)
  timer = setTimeout(syncNow, delay)
}

export function startSync() {
  if (!supabase) return
  setLocalChangeListener(() => scheduleSync())
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') setStatus({ state: 'signed-out', email: undefined })
    else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') scheduleSync(0)
  })
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleSync(0))
  window.addEventListener('online', () => scheduleSync(0))
  setInterval(() => scheduleSync(0), 5 * 60 * 1000)
}

// ---- auth -----------------------------------------------------------------
// The email holds a sign-in link back to this page (and a one-time code, if the
// Supabase email template includes {{ .Token }} – codes also work inside an installed PWA).

export async function sendLoginCode(email: string) {
  const { error } = await supabase!.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname },
  })
  if (error) throw error
}

/**
 * The email link returns with "#access_token=…" (or "#error=…") in the URL, which
 * clashes with the hash router. Let Supabase read it before the app renders, then
 * land on the settings page where the sync status is shown.
 */
export async function completeEmailLink() {
  if (!supabase || !/access_token=|error_description=/.test(location.hash)) return
  const params = new URLSearchParams(location.hash.slice(1))
  const failure = params.get('error_description')
  await supabase.auth.getSession()
  if (failure) setStatus({ state: 'signed-out', error: failure.replace(/\+/g, ' ') })
  history.replaceState(null, '', location.pathname + '#/settings')
}

export async function verifyLoginCode(email: string, token: string) {
  const { error } = await supabase!.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
}

export async function signOut() {
  await supabase!.auth.signOut()
}
