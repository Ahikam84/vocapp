import { ChevronDown, House, Languages, Library, RefreshCw, Settings } from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { detectUiLang, langName, setUiLang, t } from './lib/i18n'
import { applyUpdate, useNeedRefresh } from './lib/pwa'
import { useSettings } from './lib/settings'
import { applyTheme } from './lib/theme'
import { setTtsPreferences } from './lib/tts'
import { useStudy, type Study } from './lib/useDeck'
import Courses from './pages/Courses'
import Home from './pages/Home'
import Import from './pages/Import'
import Join from './pages/Join'
import Learn from './pages/Learn'
import Review from './pages/Review'
import SettingsPage from './pages/Settings'
import StudyPicker from './pages/StudyPicker'
import WordForm from './pages/WordForm'
import Words from './pages/Words'

/** "Unit 2", "Unit 2 + Unit 3", or "Unit 2 + 3 more" for the top bar. */
function studyLabel({ decks }: Study) {
  if (decks.length === 1) return decks[0].name
  if (decks.length === 2) return `${decks[0].name} + ${decks[1].name}`
  return t('{name} ועוד {n}', { name: decks[0].name, n: decks.length - 1 })
}

export default function App() {
  const study = useStudy()
  const settings = useSettings()
  const needRefresh = useNeedRefresh()
  useEffect(() => {
    if (settings) setTtsPreferences(settings.voices, settings.speechRate)
  }, [settings])
  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings?.theme]) // eslint-disable-line react-hooks/exhaustive-deps
  if (study === undefined || !settings) return null
  // Set before rendering children so every t() call below uses the chosen language.
  setUiLang(settings.uiLang ?? detectUiLang())
  const deck = study?.deck ?? null

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="icon.svg" alt="" width={28} height={28} />
          VocApp
        </NavLink>
        {study && (
          <Link to="/study" className="study-switch" title={t('מה לתרגל')}>
            <span className="study-lang">{langName(study.deck.targetLang)}</span>
            <span dir="auto">{studyLabel(study)}</span>
            <ChevronDown size={16} />
          </Link>
        )}
      </header>

      {needRefresh && (
        <button className="update-banner" onClick={applyUpdate}>
          <RefreshCw size={16} /> {t('יש גרסה חדשה – לחץ לרענון')}
        </button>
      )}

      <main className="content">
        {study && deck ? (
          <Routes>
            <Route path="/" element={<Home study={study} />} />
            <Route path="/learn" element={<Learn study={study} />} />
            <Route path="/review" element={<Review study={study} mode="review" />} />
            <Route path="/difficult" element={<Review study={study} mode="practice" />} />
            <Route path="/words" element={<Words study={study} />} />
            <Route path="/words/new" element={<WordForm study={study} />} />
            <Route path="/words/:id" element={<WordForm study={study} />} />
            <Route path="/import" element={<Import study={study} />} />
            <Route path="/study" element={<StudyPicker study={study} />} />
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
