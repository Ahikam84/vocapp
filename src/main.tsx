import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ensureDefaultDeck } from './lib/db'
import './styles.css'

registerSW({ immediate: true })
// Ask the browser not to evict our IndexedDB data under storage pressure.
navigator.storage?.persist?.()

ensureDefaultDeck().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  )
})
