import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { migrateFromV1 } from './lib/db'
import { refreshCourses, renameCourseDecks } from './lib/courses'
import { APP_VERSION } from './lib/pwa'
import { getSettings } from './lib/settings'
import { detectUiLang, setUiLang } from './lib/i18n'
import { completeAuthRedirect, startSync } from './lib/sync'
import '@fontsource-variable/heebo'
import './styles.css'

import './lib/pwa'
// Ask the browser not to evict our IndexedDB data under storage pressure.
navigator.storage?.persist?.()

// New users start with no course and pick a language first; existing data is migrated as before.
completeAuthRedirect()
  .then(migrateFromV1)
  .then(renameCourseDecks)
  .then(getSettings)
  .then((settings) => {
    setUiLang(settings.uiLang ?? detectUiLang())
    startSync()
    // In the background: corrections and new words in ready-made courses reach the user's copies.
    void refreshCourses(APP_VERSION).catch((e) => console.warn('Course refresh failed:', e))
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </StrictMode>,
    )
  })
