/**
 * Light/dark theme. "auto" follows the device. The choice is also kept in
 * localStorage so index.html can apply it before the app starts (no flash).
 */
export type Theme = 'auto' | 'light' | 'dark'

const KEY = 'vocapp-theme'
const BAR = { light: '#ffffff', dark: '#0e1013' }

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'auto') delete root.dataset.theme
  else root.dataset.theme = theme
  // The phone's status bar colour: both media-specific tags take the forced colour, or their own.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const own = m.media.includes('dark') ? BAR.dark : BAR.light
    m.content = theme === 'auto' ? own : BAR[theme]
  })
  try {
    if (theme === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // private mode etc. – the theme still applies once settings load
  }
}
