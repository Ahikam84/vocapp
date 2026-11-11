/**
 * Generates spoken-Levantine audio for every word and example in the Arabic courses into
 * public/audio/ar/ (one mp3 per text, plus index.json). The app plays these clips instead of
 * the device's (Modern Standard Arabic) voice.
 *
 * Works with ElevenLabs or Azure – whichever key is in .env.local (git ignores that file,
 * so the key stays on your computer and is never committed):
 *
 *   ElevenLabs:  ELEVENLABS_API_KEY=...
 *                (optional) ELEVENLABS_MODEL=eleven_multilingual_v2   – or eleven_v3
 *   Azure:       AZURE_SPEECH_KEY=...
 *                AZURE_SPEECH_REGION=westeurope
 *
 *   1. Listen to the voices:   node scripts/arabic-audio.ts --samples
 *      (ElevenLabs: every voice in "My Voices" – add Levantine ones from the Voice Library first)
 *   2. Generate everything:    node scripts/arabic-audio.ts --voice=<voice id or name>
 *      or with several voices, shared out among the words:  --voice=<id>,<id>,<id>
 *
 * Safe to run again: clips that already exist are skipped, so after editing a course only
 * the changed texts are generated (and clips no longer used are deleted). A different voice
 * or model than last time regenerates everything.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { audioKey } from '../src/lib/audioKey.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'audio', 'ar')
const indexFile = join(outDir, 'index.json')
const SAMPLE = 'مرحبا، كيفك اليوم؟ هلّأ بدّي أروح عالسوق أشتري شوية خضرة، بس لسّا ما عملت قهوة.'

interface Voice { id: string; name: string; /** ElevenLabs: 'premade' for its built-in (English) voices */ category?: string }
interface Provider {
  /** Recorded in index.json, so changing it regenerates everything */
  id(voice: Voice): string
  voices(): Promise<Voice[]>
  synthesize(text: string, voice: Voice): Promise<Buffer>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Retries when the service is busy or rate-limited; anything else is an error worth stopping for. */
async function request(url: string, init: RequestInit, what: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init)
    if (res.ok) return res
    if ((res.status === 429 || res.status >= 500) && attempt < 30) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || Math.min(60_000, 2000 * attempt)
      process.stdout.write(`  (busy, waiting ${Math.round(wait / 1000)}s)\n`)
      await sleep(wait)
      continue
    }
    const body = await res.text()
    if (res.status === 401 && /quota/i.test(body)) throw new Error(`${what}: the monthly quota is used up. ${body}`)
    if (res.status === 401 || res.status === 403) throw new Error(`${what} rejected the key (${res.status}) – check it in .env.local. ${body}`)
    throw new Error(`${what} error ${res.status}: ${body}`)
  }
}

function elevenLabs(key: string): Provider {
  const model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2'
  const headers = { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }
  return {
    id: (v) => `elevenlabs:${v.id}:${model}`,
    async voices() {
      const res = await request('https://api.elevenlabs.io/v1/voices', { headers }, 'ElevenLabs')
      const { voices } = (await res.json()) as { voices: { voice_id: string; name: string; category?: string }[] }
      return voices.map((v) => ({ id: v.voice_id, name: v.name, category: v.category }))
    },
    async synthesize(text, voice) {
      const res = await request(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_64`,
        { method: 'POST', headers, body: JSON.stringify({ text, model_id: model }) },
        'ElevenLabs',
      )
      return Buffer.from(await res.arrayBuffer())
    },
  }
}

function azure(key: string, region: string): Provider {
  const escapeXml = (s: string) =>
    s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)
  // Azure's Levantine voices: Jordan is closest to Palestinian.
  const VOICES = ['ar-JO-SanaNeural', 'ar-JO-TaimNeural', 'ar-SY-AmanyNeural', 'ar-SY-LaithNeural', 'ar-LB-LaylaNeural', 'ar-LB-RamiNeural']
  return {
    id: (v) => v.id,
    voices: async () => VOICES.map((id) => ({ id, name: id })),
    async synthesize(text, voice) {
      const locale = voice.id.split('-').slice(0, 2).join('-')
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}"><voice name="${voice.id}">${escapeXml(text)}</voice></speak>`
      const res = await request(
        `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
            'User-Agent': 'vocapp-audio-script',
          },
          body: ssml,
        },
        'Azure',
      )
      return Buffer.from(await res.arrayBuffer())
    },
  }
}

function loadEnvFile() {
  const file = join(root, '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

/** Every Arabic text the courses speak – each word and its example sentence – with the word it belongs to. */
async function courseTexts(): Promise<{ text: string; word: string }[]> {
  const texts = new Map<string, string>()
  const dir = join(root, 'src', 'courses')
  for (const file of readdirSync(dir).filter((f) => /^ar-.*\.ts$/.test(f))) {
    const words = (await import(pathToFileURL(join(dir, file)).href)).default as Record<string, string[][]>
    for (const entries of Object.values(words))
      for (const [term, , example] of entries) {
        const word = term.trim()
        if (word && !texts.has(word)) texts.set(word, word)
        if (example?.trim() && !texts.has(example.trim())) texts.set(example.trim(), word)
      }
  }
  return [...texts].map(([text, word]) => ({ text, word }))
}

/** index.json lists the clips that exist, so the app knows which texts have a recording. */
function writeIndex(voiceId: string, voiceName: string) {
  const keys = readdirSync(outDir).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort()
  writeFileSync(indexFile, JSON.stringify({ voice: voiceId, voiceName, keys }) + '\n')
}

const safeName = (s: string) => s.replace(/[^\p{L}\p{N}_-]+/gu, '_')

async function main() {
  loadEnvFile()
  const env = process.env
  const provider = env.ELEVENLABS_API_KEY
    ? elevenLabs(env.ELEVENLABS_API_KEY)
    : env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION
      ? azure(env.AZURE_SPEECH_KEY, env.AZURE_SPEECH_REGION)
      : null
  if (!provider) {
    console.error('No key found – put ELEVENLABS_API_KEY (or AZURE_SPEECH_KEY and AZURE_SPEECH_REGION) in .env.local.')
    process.exit(1)
  }
  const args = process.argv.slice(2)
  const voices = await provider.voices()

  if (args.includes('--samples')) {
    const dir = join(root, 'audio-samples')
    mkdirSync(dir, { recursive: true })
    // The voices the user added; ElevenLabs' built-in ones only if there are none.
    const added = voices.filter((v) => v.category !== 'premade')
    for (const voice of added.length ? added : voices) {
      const file = `${safeName(voice.name)}.mp3`
      try {
        writeFileSync(join(dir, file), await provider.synthesize(SAMPLE, voice))
        console.log(`audio-samples/${file}   →  --voice=${voice.id}`)
      } catch (e) {
        console.log(`(skipped ${voice.name}: ${e instanceof Error ? e.message.slice(0, 160) : e})`)
      }
    }
    console.log('\nListen to them, then run:  node scripts/arabic-audio.ts --voice=<the one you liked>')
    return
  }

  // One voice, or several separated by commas – each word (with its example) then gets one of them.
  const wanted = args.find((a) => a.startsWith('--voice='))?.slice(8).split(',').map((v) => v.trim()).filter(Boolean)
  if (!wanted?.length) {
    console.error('Choose a voice: --voice=<id or name>, or several: --voice=<id>,<id>. Run with --samples to hear them. Voices:')
    for (const v of voices) console.error(`  ${v.id}   ${v.name}`)
    process.exit(1)
  }
  const chosen: Voice[] = []
  for (const w of wanted) {
    const voice = voices.find((v) => v.id === w || v.name.toLowerCase() === w.toLowerCase())
    if (!voice) {
      console.error(`No voice "${w}". Voices you have:`)
      for (const v of voices) console.error(`  ${v.id}   ${v.name}`)
      process.exit(1)
    }
    chosen.push(voice)
  }
  const voiceId = chosen.map((v) => provider.id(v)).join(',')
  const voiceNames = chosen.map((v) => v.name.split(' - ')[0]).join(', ')
  /** The same word always gets the same voice, so re-running never shuffles them. */
  const voiceFor = (word: string) => chosen[parseInt(audioKey(word).slice(-6), 36) % chosen.length]

  mkdirSync(outDir, { recursive: true })
  const previous = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : null
  // A new voice: start over, so a run stopped halfway can resume without mixing voices.
  if (previous && previous.voice !== voiceId)
    for (const f of readdirSync(outDir)) if (f.endsWith('.mp3')) rmSync(join(outDir, f))

  const texts = await courseTexts()
  const keys = texts.map((t) => audioKey(t.text))
  if (new Set(keys).size !== keys.length) throw new Error('Two texts got the same file name – this should never happen.')

  const todo = texts.map((t, i) => ({ ...t, i })).filter(({ i }) => !existsSync(join(outDir, `${keys[i]}.mp3`)))
  const chars = todo.reduce((n, { text }) => n + text.length, 0)
  console.log(`${voiceNames}: ${texts.length} clips, ${todo.length} to make (${chars.toLocaleString()} characters).\n`)

  // Two at a time – faster, and within every plan's concurrency limit.
  let made = 0
  let next = 0
  async function worker() {
    while (next < todo.length) {
      const { text, word, i } = todo[next++]
      writeFileSync(join(outDir, `${keys[i]}.mp3`), await provider!.synthesize(text, voiceFor(word)))
      made++
      process.stdout.write(`[${made}/${todo.length}] ${text}\n`)
      // Save progress as we go, so stopping halfway still leaves a working set.
      if (made % 25 === 0) writeIndex(voiceId, voiceNames)
    }
  }
  try {
    await Promise.all([worker(), worker()])
  } finally {
    writeIndex(voiceId, voiceNames)
  }

  const used = new Set(keys.map((k) => `${k}.mp3`))
  let removed = 0
  for (const f of readdirSync(outDir))
    if (f.endsWith('.mp3') && !used.has(f)) {
      rmSync(join(outDir, f))
      removed++
    }
  writeIndex(voiceId, voiceNames)
  console.log(`\nDone with ${voiceNames}: ${texts.length} clips (${made} new, ${removed} removed).`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
