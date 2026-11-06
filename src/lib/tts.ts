const LOCALES: Record<string, string> = { es: 'es-ES', ca: 'ca-ES', he: 'he-IL', en: 'en-US', fr: 'fr-FR' }

export function ttsAvailable(lang: string): boolean {
  if (typeof speechSynthesis === 'undefined') return false
  const voices = speechSynthesis.getVoices()
  // Voices load asynchronously; until they arrive assume the language is supported.
  return voices.length === 0 || voices.some((v) => v.lang.toLowerCase().startsWith(lang))
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const locale = LOCALES[lang] ?? lang
  const voices = speechSynthesis.getVoices()
  return (
    voices.find((v) => v.lang === locale && /google|natural|online/i.test(v.name)) ??
    voices.find((v) => v.lang === locale) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(lang))
  )
}

// Chrome can garbage-collect an utterance mid-speech (cutting it off and skipping onend),
// so keep a reference to the one currently playing.
let current: SpeechSynthesisUtterance | null = null
let timer: ReturnType<typeof setTimeout> | undefined

export function speak(text: string, lang: string, rate = 0.9) {
  if (typeof speechSynthesis === 'undefined') return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = LOCALES[lang] ?? lang
  u.rate = rate
  const voice = pickVoice(lang)
  if (voice) u.voice = voice
  u.onerror = (e) => {
    // Being cut off by the next word is expected, not a failure.
    if (e.error !== 'interrupted' && e.error !== 'canceled') console.warn('TTS error:', e.error)
  }
  u.onend = () => {
    if (current === u) current = null
  }

  clearTimeout(timer)
  const busy = speechSynthesis.speaking || speechSynthesis.pending
  if (busy) speechSynthesis.cancel()
  // Chrome sometimes drops a speak() issued in the same tick as cancel(), and its
  // engine can get stuck "paused" after the tab was idle – resume() unsticks it.
  timer = setTimeout(() => {
    current = u
    speechSynthesis.resume()
    speechSynthesis.speak(u)
  }, busy ? 60 : 0)
}

if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices()
