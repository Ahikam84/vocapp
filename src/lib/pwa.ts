import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Service-worker updates. A new deploy installs in the background; we then
 * show a banner and only switch versions when the user taps it.
 */

let needRefresh = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    needRefresh = true
    notify()
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    // An installed app can stay open for days: look for a new version every
    // hour and whenever it comes back to the foreground.
    const check = () => registration.update().catch(() => {})
    setInterval(check, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  },
})

export function useNeedRefresh(): boolean {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => needRefresh,
  )
}

/** Activate the waiting version and reload. */
export const applyUpdate = () => updateSW(true)

export const APP_VERSION = __APP_VERSION__
