import { ChevronLeft, ChevronRight, Delete, Lightbulb } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { T, WritingToggle } from '../components/common'
import { cellsOf, crosswordAnswer, generateCrossword, type Crossword as Grid, type Placed } from '../lib/crossword'
import type { Word } from '../lib/db'
import { alphabetFor, baseLetters, loadGameWords, logGameAnswer, MIN_GAME_WORDS, recordScore, shuffled, withoutArticle } from '../lib/games'
import { dirOf, t } from '../lib/i18n'
import { getSettings } from '../lib/settings'
import { speak } from '../lib/tts'
import { toHebrewKeys, type Study } from '../lib/useDeck'
import { useWritingMode, writingLang, writtenForm, type WritingMode } from '../lib/writing'
import { GameOver } from './GameOver'
import { NotEnough } from './Pairs'

/** Points for each word solved, and what a revealed letter costs. */
const WORD_POINTS = 10
const HINT_COST = 2

const cellKey = (r: number, c: number) => `${r},${c}`

/** The words that can go in the grid, as they're written in this mode (without el/la). */
function crosswordItems(pool: Word[], writing: WritingMode) {
  return pool.flatMap((word) => {
    const answer = crosswordAnswer(withoutArticle(writtenForm(word, writing)))
    return answer ? [{ ref: word, answer }] : []
  })
}

/** Crossword: a new small grid each game from the learned words; the clues are their translations. */
export default function Crossword({ study }: { study: Study }) {
  const [pool, setPool] = useState<Word[] | null>(null)
  const [round, setRound] = useState(0)
  const lang = study.deck.targetLang
  const writing = useWritingMode(lang)
  const deckKey = study.deckIds.join()
  useEffect(() => {
    loadGameWords(deckKey.split(',')).then(setPool)
  }, [deckKey])
  if (!pool) return null
  if (pool.length < MIN_GAME_WORDS) return <NotEnough count={pool.length} />
  return <CrosswordRound key={`${round}-${writing}`} pool={pool} lang={lang} writing={writing} onAgain={() => setRound((r) => r + 1)} />
}

function CrosswordRound({ pool, lang, writing, onAgain }: { pool: Word[]; lang: string; writing: WritingMode; onAgain: () => void }) {
  // Built once per round (in state, so it never changes under the board while playing).
  const [grid] = useState<Grid<Word> | null>(() => {
    // A random handful of learned words; the grid keeps the ones that cross.
    const items = shuffled(crosswordItems(pool, writing)).slice(0, 18)
    return generateCrossword(items, { maxWords: 8, maxSize: 10 })
  })
  if (!grid || grid.words.length < 3) {
    return (
      <div className="page center-page">
        <p>{t('אין מספיק מילים שמתאימות לתשבץ (מילה אחת, עד 10 אותיות). למדו עוד כמה מילים ונסו שוב.')}</p>
      </div>
    )
  }
  return <Board grid={grid} pool={pool} lang={lang} writing={writing} onAgain={onAgain} />
}

function Board({ grid, pool, lang, writing, onAgain }: { grid: Grid<Word>; pool: Word[]; lang: string; writing: WritingMode; onAgain: () => void }) {
  const { words } = grid
  const keyLang = writingLang(words[0].ref, writing, lang)
  const dir = dirOf(keyLang)
  const alphabet = useMemo(() => alphabetFor(keyLang, pool), [keyLang, pool])
  const hasReadings = pool.some((w) => w.reading)

  // Which words cover each cell, and the letter that belongs there
  const { wordsAt, solution } = useMemo(() => {
    const wordsAt = new Map<string, number[]>()
    const solution = new Map<string, string>()
    words.forEach((w, i) =>
      cellsOf(w).forEach(([r, c], j) => {
        const k = cellKey(r, c)
        wordsAt.set(k, [...(wordsAt.get(k) ?? []), i])
        solution.set(k, w.answer[j])
      }),
    )
    return { wordsAt, solution }
  }, [words])

  const [fill, setFill] = useState<Record<string, string>>({})
  const [active, setActive] = useState(0)
  const [cursorState, setCursor] = useState<[number, number]>([words[0].row, words[0].col])
  const [solved, setSolved] = useState<Set<number>>(new Set())
  const [hints, setHints] = useState(0)
  const [hinted, setHinted] = useState<Set<number>>(new Set())
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [gaveUp, setGaveUp] = useState(false)
  const [over, setOver] = useState<{ prevBest: number } | null>(null)
  const startedAt = useRef(Date.now())
  const autoPlay = useRef(true)
  useEffect(() => {
    getSettings().then((s) => (autoPlay.current = s.autoPlayAudio))
  }, [])

  // Always on a cell of the grid: the selected one, or else the start of the selected word.
  const cursor: [number, number] = solution.has(cellKey(...cursorState)) ? cursorState : [words[active].row, words[active].col]
  const done = gaveUp || solved.size === words.length
  const score = Math.max(0, solved.size * WORD_POINTS - hints * HINT_COST)
  const word = words[active]
  const cursorKey = cellKey(...cursor)
  const locked = (k: string) => (wordsAt.get(k) ?? []).some((i) => solved.has(i)) || revealed.has(k)

  /** Marks words that are now complete and right; returns the new set. */
  function checkSolved(nextFill: Record<string, string>, cells: string[], nowHinted = hinted) {
    const next = new Set(solved)
    for (const k of cells)
      for (const i of wordsAt.get(k) ?? []) {
        if (next.has(i)) continue
        const w = words[i]
        if (cellsOf(w).every(([r, c], j) => nextFill[cellKey(r, c)] === w.answer[j])) {
          next.add(i)
          logGameAnswer('crossword', w.ref, true, Date.now() - startedAt.current, nowHinted.has(i))
          if (autoPlay.current) speak(w.ref.term, lang)
        }
      }
    if (next.size !== solved.size) setSolved(next)
    return next
  }

  /** Moves to the next word that isn't solved yet (in clue order), at its first empty cell. */
  function nextWord(from: number, step: 1 | -1, solvedNow = solved) {
    for (let n = 1; n <= words.length; n++) {
      const i = (from + step * n + words.length * 2) % words.length
      if (solvedNow.has(i) && solvedNow.size < words.length) continue
      selectWord(i)
      return
    }
  }

  function selectWord(i: number, at?: [number, number]) {
    setActive(i)
    const cells = cellsOf(words[i])
    setCursor(at ?? cells.find(([r, c]) => !fill[cellKey(r, c)]) ?? cells[0])
  }

  function tapCell(r: number, c: number) {
    if (done) return
    const here = wordsAt.get(cellKey(r, c)) ?? []
    if (!here.length) return
    // Tapping the selected cell again switches between across and down where two words cross.
    const same = cursor[0] === r && cursor[1] === c
    const pick = same ? here.find((i) => i !== active) ?? active : here.includes(active) ? active : here[0]
    selectWord(pick, [r, c])
  }

  function type(raw: string) {
    if (done) return
    const letter = baseLetters(keyLang === 'he' ? toHebrewKeys(raw) : raw)
    if (!/^\p{L}$/u.test(letter)) return
    const cells = cellsOf(word)
    const at = cells.findIndex(([r, c]) => r === cursor[0] && c === cursor[1])
    if (!locked(cursorKey)) {
      const nextFill = { ...fill, [cursorKey]: letter }
      setFill(nextFill)
      const nowSolved = checkSolved(nextFill, [cursorKey])
      if (nowSolved.has(active) && !solved.has(active)) {
        nextWord(active, 1, nowSolved)
        return
      }
    }
    // On to the next cell of the word that's still open
    const rest = cells.slice(at + 1).find(([r, c]) => !locked(cellKey(r, c)))
    if (rest) setCursor(rest)
  }

  function erase() {
    if (done) return
    if (fill[cursorKey] && !locked(cursorKey)) {
      setFill({ ...fill, [cursorKey]: '' })
      return
    }
    const cells = cellsOf(word)
    const at = cells.findIndex(([r, c]) => r === cursor[0] && c === cursor[1])
    const back = cells.slice(0, Math.max(0, at)).reverse().find(([r, c]) => !locked(cellKey(r, c)))
    if (back) {
      setCursor(back)
      setFill({ ...fill, [cellKey(...back)]: '' })
    }
  }

  /** Shows the right letter in the selected cell (or the word's first missing one). */
  function hint() {
    if (done) return
    const target = !locked(cursorKey) && fill[cursorKey] !== solution.get(cursorKey)
      ? cursor
      : cellsOf(word).find(([r, c]) => fill[cellKey(r, c)] !== solution.get(cellKey(r, c)))
    if (!target) return
    const k = cellKey(...target)
    const nextFill = { ...fill, [k]: solution.get(k)! }
    const nowHinted = new Set([...hinted, ...(wordsAt.get(k) ?? [])])
    setFill(nextFill)
    setHints((h) => h + 1)
    setHinted(nowHinted)
    setRevealed(new Set([...revealed, k]))
    const nowSolved = checkSolved(nextFill, [k], nowHinted)
    if (nowSolved.has(active) && !solved.has(active)) nextWord(active, 1, nowSolved)
    else {
      const cells = cellsOf(word)
      const after = cells.slice(cells.findIndex(([r, c]) => cellKey(r, c) === k) + 1).find(([r, c]) => !locked(cellKey(r, c)) && cellKey(r, c) !== k)
      if (after) setCursor(after)
    }
  }

  function giveUp() {
    words.forEach((w, i) => {
      if (!solved.has(i)) logGameAnswer('crossword', w.ref, false, Date.now() - startedAt.current)
    })
    setGaveUp(true)
  }

  async function finish() {
    setOver({ prevBest: await recordScore('crossword', score) })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Backspace') { e.preventDefault(); erase(); return }
      if ([...e.key].length === 1) type(e.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (over) return <GameOver game="crossword" title={gaveUp ? t('סוף התשבץ') : t('התשבץ הושלם!')} score={score} prevBest={over.prevBest} since={startedAt.current} onAgain={onAgain} />

  const activeCells = new Set(cellsOf(word).map(([r, c]) => cellKey(r, c)))
  const numbers = new Map(words.map((w) => [cellKey(w.row, w.col), w.number]))
  const cells = [...solution.keys()].map((k) => k.split(',').map(Number) as [number, number])
  const clue = (w: Placed<Word>) => w.ref.translations.join(', ')

  return (
    <div className="page game crossword-game">
      <div className="game-bar">
        <span className="game-points">{t('{n} מתוך {total} מילים', { n: solved.size, total: words.length })}</span>
        <span className="game-points">{t('{n} נקודות', { n: score })}</span>
      </div>
      {/* Switching builds a new grid, so it's offered only before the first letter. */}
      {hasReadings && !Object.values(fill).some(Boolean) && <WritingToggle lang={lang} mode={writing} />}

      <div
        className="cw-grid"
        dir={dir}
        style={{ '--cols': grid.width, '--rows': grid.height } as React.CSSProperties}
        role="grid"
        aria-label={t('תשבץ')}
      >
        {cells.map(([r, c]) => {
          const k = cellKey(r, c)
          const right = gaveUp ? solution.get(k) : fill[k]
          const wrongAtEnd = gaveUp && fill[k] !== solution.get(k)
          const isSolved = (wordsAt.get(k) ?? []).some((i) => solved.has(i))
          return (
            <button
              key={k}
              type="button"
              className={[
                'cw-cell',
                activeCells.has(k) && !done ? 'in-word' : '',
                k === cursorKey && !done ? 'cursor' : '',
                isSolved ? 'solved' : '',
                revealed.has(k) ? 'revealed' : '',
                wrongAtEnd ? 'missed' : '',
              ].join(' ')}
              style={{ gridRow: r + 1, gridColumn: c + 1 }}
              onClick={() => tapCell(r, c)}
              aria-label={numbers.has(k) ? String(numbers.get(k)) : undefined}
            >
              {numbers.has(k) && <small>{numbers.get(k)}</small>}
              <span>{right}</span>
            </button>
          )
        })}
      </div>

      {done ? (
        <div className="cw-end">
          <p>{gaveUp ? t('הנה הפתרון. האותיות באדום הן אלה שלא הושלמו.') : t('כל הכבוד! פתרת את כל התשבץ.')}</p>
          <button className="btn" autoFocus onClick={finish}>{t('המשך')}</button>
        </div>
      ) : (
        <>
          <div className="cw-clue">
            <button type="button" className="icon-btn" aria-label={t('הגדרה קודמת')} onClick={() => nextWord(active, -1)}><ChevronRight size={22} /></button>
            <p>
              <b>{word.number} {word.across ? t('מאוזן') : t('מאונך')}</b>{' '}
              <T>{clue(word)}</T>
            </p>
            <button type="button" className="icon-btn" aria-label={t('ההגדרה הבאה')} onClick={() => nextWord(active, 1)}><ChevronLeft size={22} /></button>
          </div>
          <div className="plant-keys cw-keys" dir={dir}>
            {alphabet.map((ch) => (
              <button key={ch} type="button" onClick={() => type(ch)}>{ch}</button>
            ))}
            <button type="button" className="cw-erase" aria-label={t('מחיקה')} onClick={erase}><Delete size={20} /></button>
          </div>
          <div className="row center cw-actions">
            <button type="button" className="btn secondary" onClick={hint}><Lightbulb size={18} /> {t('רמז: אות אחת')}</button>
            <button type="button" className="btn secondary" onClick={giveUp}>{t('הצג פתרון')}</button>
          </div>
        </>
      )}
    </div>
  )
}
