import { NavLink, Route, Routes } from 'react-router-dom'
import { useDeck } from './lib/useDeck'
import Home from './pages/Home'
import Learn from './pages/Learn'
import Review from './pages/Review'
import Words from './pages/Words'
import WordForm from './pages/WordForm'
import Import from './pages/Import'
import SettingsPage from './pages/Settings'

export default function App() {
  const deck = useDeck()
  if (!deck) return null

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="icon.svg" alt="" width={28} height={28} />
          VocApp
        </NavLink>
        <span className="deck-name">{deck.name}</span>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<Home deck={deck} />} />
          <Route path="/learn" element={<Learn deck={deck} />} />
          <Route path="/review" element={<Review deck={deck} mode="review" />} />
          <Route path="/difficult" element={<Review deck={deck} mode="practice" />} />
          <Route path="/words" element={<Words deck={deck} />} />
          <Route path="/words/new" element={<WordForm deck={deck} />} />
          <Route path="/words/:id" element={<WordForm deck={deck} />} />
          <Route path="/import" element={<Import deck={deck} />} />
          <Route path="/settings" element={<SettingsPage deck={deck} />} />
        </Routes>
      </main>

      <nav className="tabbar">
        <NavLink to="/" end>🏠<span>בית</span></NavLink>
        <NavLink to="/words">📚<span>מילים</span></NavLink>
        <NavLink to="/words/new">➕<span>הוספה</span></NavLink>
        <NavLink to="/settings">⚙️<span>הגדרות</span></NavLink>
      </nav>
    </div>
  )
}
