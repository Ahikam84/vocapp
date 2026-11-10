/**
 * File name of a pre-recorded audio clip: a hash of the exact text spoken.
 * Shared by the app and scripts/arabic-audio.ts, so both must agree – don't change it,
 * or every recording has to be generated again.
 */
export function audioKey(text: string): string {
  const s = text.trim().normalize('NFC')
  // cyrb53 – a fast 53-bit string hash; collisions are negligible for a few thousand clips.
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** Languages that have pre-recorded clips under public/audio/<lang>/. */
export const RECORDED_LANGS = ['ar']
