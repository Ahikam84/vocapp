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

export function speak(text: string, lang: string, rate = 0.9) {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = LOCALES[lang] ?? lang
  u.rate = rate
  const voice = pickVoice(lang)
  if (voice) u.voice = voice
  speechSynthesis.speak(u)
}

if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices()
