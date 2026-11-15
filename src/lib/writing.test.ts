import { describe, expect, it } from 'vitest'
import { acceptedTerms } from './answer'
import { canWriteInReading } from './writing'

describe('answering in transliteration', () => {
  it('is offered for spoken Arabic only', () => {
    expect(canWriteInReading('ar')).toBe(true)
    expect(canWriteInReading('he')).toBe(false)
    expect(canWriteInReading('es')).toBe(false)
  })
  it("doesn't accept the transliteration where it's only a reading aid", () => {
    const word = { term: 'שלום', reading: 'shalom' }
    expect(acceptedTerms(word, false)).toEqual(['שלום'])
    expect(acceptedTerms(word)).toContain('shalom')
  })
})
