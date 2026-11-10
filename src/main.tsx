import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { migrateFromV1 } from './lib/db'
import { renameCourseDecks } from './lib/courses'
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
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </StrictMode>,
    )
  })
