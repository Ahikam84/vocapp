/**
 * Generates spoken-Levantine audio for every word and example in the Arabic courses,
 * using Azure's neural voices, into public/audio/ar/ (one mp3 per text, plus index.json).
 * The app plays these clips instead of the device's (Modern Standard Arabic) voice.
 *
 * Run it on your own computer – the key stays there and is never committed:
 *   1. Put your key and region in .env.local (git ignores it):
 *        AZURE_SPEECH_KEY=...
 *        AZURE_SPEECH_REGION=westeurope
 *   2. Listen to the voices and pick one:   node scripts/arabic-audio.ts --samples
 *   3. Generate everything with it:         node scripts/arabic-audio.ts --voice=ar-JO-SanaNeural
 *
 * Safe to run again: clips that already exist are skipped, so after editing a course only
 * the changed texts are generated (and clips no longer used are deleted). Passing a
 * different --voice than last time regenerates everything.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { audioKey } from '../src/lib/audioKey.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'audio', 'ar')
const indexFile = join(outDir, 'index.json')

/** Azure's Levantine voices. */
const VOICES = [
  'ar-JO-SanaNeural', 'ar-JO-TaimNeural', // Jordan – closest to Palestinian
  'ar-SY-AmanyNeural', 'ar-SY-LaithNeural', // Syria
  'ar-LB-LaylaNeural', 'ar-LB-RamiNeural', // Lebanon
]

function loadEnvFile() {
  const file = join(root, '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function synthesize(text: string, voice: string, key: string, region: string): Promise<Buffer> {
  const locale = voice.split('-').slice(0, 2).join('-')
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}"><voice name="${voice}">${escapeXml(text)}</voice></speak>`
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'vocapp-audio-script',
      },
      body: ssml,
    })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    // The free tier allows only a few requests a minute – wait and try again.
    if ((res.status === 429 || res.status >= 500) && attempt < 30) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || Math.min(60_000, 2000 * attempt)
      process.stdout.write(`  (busy, waiting ${Math.round(wait / 1000)}s)\n`)
      await sleep(wait)
      continue
    }
    if (res.status === 401) throw new Error('Azure rejected the key (401) – check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.')
    throw new Error(`Azure error ${res.status}: ${await res.text()}`)
  }
}

/** Every Arabic text the courses speak: each word and each example sentence. */
async function courseTexts(): Promise<string[]> {
  const texts = new Set<string>()
  const dir = join(root, 'src', 'courses')
  for (const file of readdirSync(dir).filter((f) => /^ar-.*\.ts$/.test(f))) {
    const words = (await import(pathToFileURL(join(dir, file)).href)).default as Record<string, string[][]>
    for (const entries of Object.values(words))
      for (const [term, , example] of entries) {
        if (term?.trim()) texts.add(term.trim())
        if (example?.trim()) texts.add(example.trim())
      }
  }
  return [...texts]
}

async function main() {
  loadEnvFile()
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) {
    console.error('Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION – put them in .env.local (see the top of this file).')
    process.exit(1)
  }
  const args = process.argv.slice(2)

  if (args.includes('--samples')) {
    const dir = join(root, 'audio-samples')
    mkdirSync(dir, { recursive: true })
    const sample = 'مرحبا، كيفك اليوم؟ هلّأ بدّي أروح عالسوق أشتري شوية خضرة، بس لسّا ما عملت قهوة.'
    for (const voice of VOICES) {
      writeFileSync(join(dir, `${voice}.mp3`), await synthesize(sample, voice, key, region))
      console.log(`audio-samples/${voice}.mp3`)
    }
    console.log('\nListen to them, then run:  node scripts/arabic-audio.ts --voice=<the one you liked>')
    return
  }

  const previous = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : null
  const voice = args.find((a) => a.startsWith('--voice='))?.slice(8) ?? previous?.voice ?? VOICES[0]
  if (!VOICES.includes(voice)) console.warn(`Note: ${voice} is not one of the Levantine voices (${VOICES.join(', ')}).`)
  mkdirSync(outDir, { recursive: true })
  // A new voice: start over, so a run stopped halfway can resume without mixing voices.
  if (previous && previous.voice !== voice)
    for (const f of readdirSync(outDir)) if (f.endsWith('.mp3')) rmSync(join(outDir, f))

  const texts = await courseTexts()
  const keys = texts.map(audioKey)
  if (new Set(keys).size !== keys.length) throw new Error('Two texts got the same file name – this should never happen.')

  let made = 0
  for (const [i, text] of texts.entries()) {
    const file = join(outDir, `${keys[i]}.mp3`)
    if (existsSync(file)) continue
    writeFileSync(file, await synthesize(text, voice, key, region))
    made++
    process.stdout.write(`[${i + 1}/${texts.length}] ${text}\n`)
    // Save progress as we go, so stopping halfway still leaves a working set.
    if (made % 25 === 0) writeIndex(voice)
  }

  const wanted = new Set(keys.map((k) => `${k}.mp3`))
  let removed = 0
  for (const f of readdirSync(outDir))
    if (f.endsWith('.mp3') && !wanted.has(f)) {
      rmSync(join(outDir, f))
      removed++
    }
  writeIndex(voice)
  console.log(`\nDone with ${voice}: ${texts.length} clips (${made} new, ${removed} removed).`)
}

/** index.json lists the clips that exist, so the app knows which texts have a recording. */
function writeIndex(voice: string) {
  const keys = readdirSync(outDir).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort()
  writeFileSync(indexFile, JSON.stringify({ voice, keys }) + '\n')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
