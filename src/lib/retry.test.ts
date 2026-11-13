import { describe, expect, it } from 'vitest'
import { nextRetry } from './retry'

describe('nextRetry', () => {
  it('brings a missed typed word back as multiple choice, then climbs to typing', () => {
    expect(nextRetry('typing', false, true)).toBe('choice-source')
    expect(nextRetry('choice-source', true, true)).toBe('tiles')
    expect(nextRetry('tiles', true, true)).toBe('typing')
    expect(nextRetry('typing', true, true)).toBeNull()
  })
  it('steps further down after another miss, never below the easiest', () => {
    expect(nextRetry('choice-source', false, true)).toBe('choice-target')
    expect(nextRetry('choice-target', false, true)).toBe('choice-target')
    expect(nextRetry('audio-choice', false, true)).toBe('choice-target')
    expect(nextRetry('choice-target', true, true)).toBe('choice-source')
  })
  it('uses letters instead of multiple choice when there are too few words', () => {
    expect(nextRetry('typing', false, false)).toBe('tiles')
    expect(nextRetry('tiles', false, false)).toBe('tiles')
  })
})
