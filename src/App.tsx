import { House, Languages, Library, Settings } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { db } from './lib/db'
import { detectUiLang, setUiLang, t } from './lib/i18n'
import { setSetting, useSettings } from './lib/settings'
import { setTtsPreferences } from './lib/tts'
import { useDeck } from './lib/useDeck'
import Courses from './pages/Courses'
import Home from './pages/Home'
import Import from './pages/Import'
import Join from './pages/Join'
import Learn from './pages/Learn'
import Review from './pages/Review'
import SettingsPage from './pages/Settings'
import WordForm from './pages/WordForm'
import Words from './pages/Words'

export default function App() {
  const deck = useDeck()
  const settings = useSettings()
  const decks = useLiveQuery(() => db.decks.toArray().then((ds) => ds.sort((a, b) => a.createdAt - b.createdAt)))
  useEffect(() => {
    if (settings) setTtsPreferences(settings.voices, settings.speechRate)
  }, [settings])
  if (deck === undefined || !settings) return null
  // Set before rendering children so every t() call below uses the chosen language.
  setUiLang(settings.uiLang ?? detectUiLang())

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="icon.svg" alt="" width={28} height={28} />
          VocApp
        </NavLink>
        {deck && decks && decks.length > 1 ? (
          <select className="deck-switch" value={deck.id} onChange={(e) => setSetting('currentDeckId', e.target.value)} aria-label={t('קורס נוכחי')}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        ) : deck ? (
          <Link to="/courses" className="deck-name">{deck.name}</Link>
        ) : null}
      </header>

      <main className="content">
        {deck ? (
          <Routes>
            <Route path="/" element={<Home deck={deck} />} />
            <Route path="/learn" element={<Learn deck={deck} />} />
            <Route path="/review" element={<Review deck={deck} mode="review" />} />
            <Route path="/difficult" element={<Review deck={deck} mode="practice" />} />
            <Route path="/words" element={<Words deck={deck} />} />
            <Route path="/words/new" element={<WordForm deck={deck} />} />
            <Route path="/words/:id" element={<WordForm deck={deck} />} />
            <Route path="/import" element={<Import deck={deck} />} />
            <Route path="/courses" element={<Courses deck={deck} />} />
            <Route path="/courses/:lang" element={<Courses deck={deck} />} />
            <Route path="/join/:code" element={<Join />} />
            <Route path="/settings" element={<SettingsPage deck={deck} />} />
          </Routes>
        ) : (
          // No course yet: everything leads to choosing a language and a course.
          <Routes>
            <Route path="/join/:code" element={<Join />} />
            <Route path="/settings" element={<SettingsPage deck={null} />} />
            <Route path="/courses/:lang" element={<Courses deck={null} />} />
            <Route path="*" element={<Courses deck={null} />} />
          </Routes>
        )}
      </main>

      <nav className="tabbar">
        <NavLink to="/" end><House size={22} /><span>{t('בית')}</span></NavLink>
        {deck && <NavLink to="/words" end><Library size={22} /><span>{t('מילים')}</span></NavLink>}
        <NavLink to="/courses"><Languages size={22} /><span>{t('קורסים')}</span></NavLink>
        <NavLink to="/settings"><Settings size={22} /><span>{t('הגדרות')}</span></NavLink>
      </nav>
    </div>
  )
}
