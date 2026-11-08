import { useEffect, useState } from 'react'

const LOCALES: Record<string, string> = {
  es: 'es-ES', ca: 'ca-ES', he: 'he-IL', en: 'en-US', fr: 'fr-FR', it: 'it-IT', de: 'de-DE', pt: 'pt-PT', ar: 'ar-SA',
}

export function ttsAvailable(lang: string): boolean {
  if (typeof speechSynthesis === 'undefined') return false
  const voices = speechSynthesis.getVoices()
  // Voices load asynchronously; until they arrive assume the language is supported.
  return voices.length === 0 || voices.some((v) => v.lang.toLowerCase().startsWith(lang))
}

// User preferences, pushed in from settings so callers don't have to pass them around.
let preferredVoices: Record<string, string> = {}
let defaultRate = 0.9

export function setTtsPreferences(voices: Record<string, string>, rate: number) {
  preferredVoices = voices
  defaultRate = rate
}

const NATURAL = /natural|neural|online|google|premium|enhanced/i

/** Voices for a language, the most natural-sounding first. */
export function voicesFor(lang: string): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  const locale = LOCALES[lang] ?? lang
  const score = (v: SpeechSynthesisVoice) => (NATURAL.test(v.name) ? 0 : 2) + (v.lang === locale ? 0 : 1)
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith(lang))
    .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = voicesFor(lang)
  return voices.find((v) => v.voiceURI === preferredVoices[lang]) ?? voices[0]
}

export function useVoices(lang: string): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(() => voicesFor(lang))
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return
    const update = () => setVoices(voicesFor(lang))
    update()
    speechSynthesis.addEventListener('voiceschanged', update)
    return () => speechSynthesis.removeEventListener('voiceschanged', update)
  }, [lang])
  return voices
}

// Chrome can garbage-collect an utterance mid-speech (cutting it off and skipping onend),
// so keep a reference to the one currently playing.
let current: SpeechSynthesisUtterance | null = null
let timer: ReturnType<typeof setTimeout> | undefined

export function speak(text: string, lang: string, rate = defaultRate) {
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
