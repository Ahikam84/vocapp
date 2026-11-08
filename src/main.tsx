import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { migrateFromV1 } from './lib/db'
import { getSettings } from './lib/settings'
import { detectUiLang, setUiLang } from './lib/i18n'
import { completeEmailLink, startSync } from './lib/sync'
import '@fontsource-variable/heebo'
import './styles.css'

registerSW({ immediate: true })
// Ask the browser not to evict our IndexedDB data under storage pressure.
navigator.storage?.persist?.()

// New users start with no course and pick a language first; existing data is migrated as before.
completeEmailLink()
  .then(migrateFromV1)
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
