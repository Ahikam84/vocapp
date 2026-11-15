"""Captures the app's screens for the how-to videos from the dev server (npm run dev, port 3000), in a
fresh browser each time, with sample data set up through the app's own modules.

    python -I scripts/video/capture.py student|teacher
Screens go to video-build/<name>/screens/<scene>.png (phone size, 390x844 at 2x)."""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
APP = 'http://localhost:3000/'
which = sys.argv[1]
out = ROOT / 'video-build' / which / 'screens'
out.mkdir(parents=True, exist_ok=True)


def run(page, code: str):
    """Runs async code in the page, with the app's modules at hand."""
    return page.evaluate(f"""async () => {{
      const m = (p) => import('/src/' + p);
      const {{ db }} = await m('lib/db.ts');
      const {{ setSetting, getSettings }} = await m('lib/settings.ts');
      {code}
    }}""")


def shot(page, name: str, highlight: str | None = None, scroll: str | None = None):
    page.wait_for_timeout(700)
    if scroll:
        page.locator(scroll).first.evaluate("el => el.scrollIntoView({ block: 'center' })")
        page.wait_for_timeout(300)
    if highlight:
        page.locator(highlight).first.evaluate("el => { el.style.outline = '4px solid #f59e0b'; el.style.outlineOffset = '3px'; el.style.borderRadius = el.style.borderRadius || '14px' }")
    # No blinking caret or hover states in the stills
    page.mouse.move(0, 0)
    page.screenshot(path=str(out / f'{name}.png'))
    if highlight:
        page.locator(highlight).first.evaluate("el => { el.style.outline = '' }")
    print('captured', name)


def go(page, hash_: str):
    page.evaluate(f"location.hash = '{hash_}'")
    page.wait_for_timeout(900)


def click_text(page, text: str):
    page.get_by_text(text, exact=True).first.click()
    page.wait_for_timeout(500)


SETUP_STUDENT = """
  const { COURSES } = await m('courses/index.ts');
  const { addCourse } = await m('lib/courses.ts');
  const { markLearned } = await m('lib/srs.ts');
  const { loadMedals } = await m('lib/medals.ts');
  const { newId } = await m('lib/db.ts');
  const { deckId } = await addCourse(COURSES.find((c) => c.id === 'es-a1'));
  await setSetting('currentDeckId', deckId);
  const words = await db.words.where('deckId').equals(deckId).sortBy('createdAt');
  // Learned on earlier days, so today's new words are still to come
  for (const w of words.slice(0, 40)) await markLearned(w.id, deckId, new Date(Date.now() - 5 * 86400000));
  // Twelve words due today, a few right answers today (the goal ring part-way), a week's streak
  const due = await db.progress.where('deckId').equals(deckId).limit(12).toArray();
  for (const p of due) await db.progress.update(p.wordId, { due: Date.now() - 60000 });
  const day = 86400000;
  for (let d = 6; d >= 0; d--)
    for (let i = 0; i < (d ? 6 : 2); i++)
      await db.reviews.add({ id: newId(), wordId: words[i].id, deckId, mode: 'review', exercise: 'typing', correct: true, responseMs: 3000, at: Date.now() - d * day - i * 1000 });
  await setSetting('goalChosen', true);
  await setSetting('invites', { games: 1, account: 1, test: 1 });
  await setSetting('welcomeSeen', true);
  const medals = await loadMedals();
  await setSetting('medalsSeen', medals.map((x) => x.id));
"""


def student(page):
    run(page, "await setSetting('uiLang', 'he');")
    page.reload()
    shot(page, 's01-welcome')
    click_text(page, 'להמשיך בלי חשבון')
    shot(page, 's02-languages')
    run(page, SETUP_STUDENT)
    go(page, '#/')
    page.reload()
    page.wait_for_timeout(1200)
    shot(page, 's03-home')

    go(page, '#/learn')
    shot(page, 's04-learn')
    # Through the new words' cards to the first question with choices
    for _ in range(12):
        if page.locator('.option').count():
            break
        page.locator('main .btn').last.click()
        page.wait_for_timeout(500)
    shot(page, 's05-exercise')

    go(page, '#/')
    go(page, '#/review')
    shot(page, 's06-review')

    go(page, '#/games')
    shot(page, 's07-games', highlight='a[href="#/games/crossword"]', scroll='a[href="#/games/crossword"]')

    go(page, '#/games/crossword')
    # Fill in the first clue, so the grid shows a solved word
    run(page, """
      const { crosswordAnswer } = await m('lib/crossword.ts');
      const words = await db.words.toArray();
      const clue = document.querySelector('.cw-clue p').innerText.replace(/^\\d+ \\S+\\s*/, '');
      const w = words.find((x) => x.translations.join(', ') === clue);
      for (const ch of crosswordAnswer(w.term.replace(/^(el|la|los|las)\\s+/i, '')))
        { [...document.querySelectorAll('.cw-keys button')].find((b) => b.textContent === ch)?.click(); await new Promise((r) => setTimeout(r, 120)); }
    """)
    page.wait_for_timeout(1500)
    shot(page, 's08-crossword')

    go(page, '#/test')
    shot(page, 's09-test')
    go(page, '#/medals')
    shot(page, 's10-medals')
    go(page, '#/')
    page.evaluate('window.scrollTo(0, 0)')
    shot(page, 's11-outro')


FAMILY = '\n'.join([
    'la madre - אמא', 'el padre - אבא', 'el hermano - אח', 'la hermana - אחות', 'el abuelo - סבא',
    'la abuela - סבתא', 'el hijo - בן', 'la hija - בת', 'el tío - דוד', 'la tía - דודה',
])


def teacher(page):
    run(page, "await setSetting('uiLang', 'he'); await setSetting('welcomeSeen', true); await setSetting('goalChosen', true);")
    page.reload()
    page.wait_for_timeout(800)
    shot(page, 't01-intro')

    go(page, '#/courses/es')
    page.get_by_placeholder('למשל: פרק 3 – משפחה').fill('פרק 3 – משפחה')
    shot(page, 't02-new-course', highlight='form:has(input[placeholder="למשל: פרק 3 – משפחה"]) .btn', scroll='form:has(input[placeholder="למשל: פרק 3 – משפחה"]) .btn')
    click_text(page, 'יצירת קורס')
    page.wait_for_timeout(800)
    page.locator('textarea').first.fill(FAMILY)
    page.wait_for_timeout(500)
    shot(page, 't03-import', highlight='textarea')
    page.get_by_role('button', name='ייבוא 10 מילים').click()
    page.wait_for_timeout(800)

    go(page, '#/words/new')
    inputs = page.locator('form input')
    inputs.nth(0).fill('el primo')
    inputs.nth(1).fill('בן דוד')
    page.locator('summary').first.click()
    page.wait_for_timeout(300)
    page.locator('form input').nth(2).fill('Mi primo vive en Madrid.')
    page.locator('main').first.evaluate('el => el.ownerDocument.activeElement?.blur()')
    shot(page, 't04-word-form')

    go(page, '#/words')
    shot(page, 't05-words')

    go(page, '#/courses/es')
    click_text(page, 'שיתוף עם תלמידים')
    shot(page, 't06-share', highlight='.share-panel .btn', scroll='.share-panel')
    # The link and code as they look once shared (local only: nothing is published)
    run(page, "const s = await getSettings(); await db.decks.update(s.currentDeckId, { shareCode: 'FAM3K7' });")
    page.wait_for_timeout(600)
    # The link as students get it from the live site
    page.locator('.share-link input').evaluate("el => { el.value = 'https://ahikam84.github.io/vocapp/#/join/FAM3K7' }")
    shot(page, 't07-share-code', highlight='.share-panel', scroll='.share-panel')
    shot(page, 't09-update', highlight='button:has-text("עדכון הגרסה המשותפת")', scroll='.share-panel')

    page.locator('.code-input').fill('FAM3K7')
    shot(page, 't08-join', highlight='form:has(.code-input)', scroll='.code-input')

    page.locator('.code-input').fill('')
    shot(page, 't10-ready', scroll='h2:has-text("קורסים מוכנים")')
    go(page, '#/')
    page.evaluate('window.scrollTo(0, 0)')
    shot(page, 't11-outro')


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='he-IL', is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto(APP)
    page.wait_for_timeout(1500)
    (student if which == 'student' else teacher)(page)
    browser.close()
