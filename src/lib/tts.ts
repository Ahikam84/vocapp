import { useEffect, useState } from 'react'
import { audioKey, RECORDED_LANGS } from './audioKey'

const LOCALES: Record<string, string> = {
  es: 'es-ES', ca: 'ca-ES', he: 'he-IL', en: 'en-US', fr: 'fr-FR', it: 'it-IT', de: 'de-DE', pt: 'pt-PT', ar: 'ar-SA',
}

export function ttsAvailable(lang: string): boolean {
  if (loaded[lang]?.keys.size) return true
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

// --- Pre-recorded clips (scripts/arabic-audio.ts) ---------------------------------------
// For the Arabic courses the device voice would read Modern Standard Arabic, so the course
// texts come with recordings in a Levantine voice. Anything without one is still read by the device.

interface RecordingIndex {
  /** The voice's display name, e.g. "ar-JO-SanaNeural" or an ElevenLabs voice's name */
  voice?: string
  keys: Set<string>
  /** Re-recorded clips live under a new file name, so devices that cached the old one fetch it */
  files?: Record<string, string>
}
const recordings: Record<string, Promise<RecordingIndex>> = {}
const loaded: Record<string, RecordingIndex> = {}

function recordingIndex(lang: string): Promise<RecordingIndex> {
  if (!RECORDED_LANGS.includes(lang) || typeof fetch === 'undefined') return Promise.resolve({ keys: new Set() })
  return (recordings[lang] ??= fetch(`audio/${lang}/index.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { keys: [] }))
    .then((index: { voice?: string; voiceName?: string; keys: string[]; files?: Record<string, string> }) =>
      (loaded[lang] = { voice: index.voiceName ?? index.voice, keys: new Set(index.keys), files: index.files }))
    .catch(() => {
      delete recordings[lang] // try again next time, e.g. once back online
      return { keys: new Set<string>() }
    }))
}
for (const lang of RECORDED_LANGS) void recordingIndex(lang)

/** The voice the course recordings were made with, if this language has any. */
export function useRecordedVoice(lang: string): string | undefined {
  const [voice, setVoice] = useState(() => (loaded[lang]?.keys.size ? loaded[lang].voice : undefined))
  useEffect(() => {
    let live = true
    void recordingIndex(lang).then((index) => live && setVoice(index.keys.size ? index.voice : undefined))
    return () => {
      live = false
    }
  }, [lang])
  return voice
}

const clipUrls = new Map<string, string>()
let audio: HTMLAudioElement | null = null
let request = 0

async function clipUrl(lang: string, key: string): Promise<string> {
  const cached = clipUrls.get(key)
  if (cached) return cached
  // Fetched whole (not streamed) so the service worker can keep it for offline use.
  const res = await fetch(`audio/${lang}/${key}.mp3`)
  if (!res.ok) throw new Error(`audio ${res.status}`)
  const url = URL.createObjectURL(await res.blob())
  clipUrls.set(key, url)
  return url
}

export function speak(text: string, lang: string, rate = defaultRate) {
  const id = ++request
  audio?.pause()
  if (!RECORDED_LANGS.includes(lang)) return speakWithDevice(text, lang, rate)
  const key = audioKey(text)
  void recordingIndex(lang)
    .then(async ({ keys, files }) => {
      if (id !== request) return // another word was asked for meanwhile
      if (!keys.has(key)) return speakWithDevice(text, lang, rate)
      const url = await clipUrl(lang, files?.[key] ?? key)
      if (id !== request) return
      clearTimeout(timer)
      if (typeof speechSynthesis !== 'undefined' && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel()
      audio ??= new Audio()
      audio.src = url
      audio.playbackRate = rate
      audio.preservesPitch = true
      await audio.play()
    })
    .catch((e) => {
      if (id !== request || (e instanceof DOMException && e.name === 'AbortError')) return
      console.warn('Recorded audio failed, using the device voice:', e)
      speakWithDevice(text, lang, rate)
    })
}

function speakWithDevice(text: string, lang: string, rate: number) {
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
