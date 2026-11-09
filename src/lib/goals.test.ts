import { describe, expect, it } from 'vitest'
import { activityByDay, answerXp, computeStreak, dayKey, XP, type DayActivity } from './goals'

const met = (a: DayActivity) => a.xp >= 50
/** Build a history from a string, oldest first: "x" = goal met, "." = not met / no practice. */
function history(pattern: string) {
  const days = new Map<number, DayActivity>()
  ;[...pattern].forEach((c, i) => c === 'x' && days.set(i, { xp: 60, minutes: 5, answers: 10 }))
  if (!days.size) days.set(0, { xp: 1, minutes: 0, answers: 1 })
  return { days, today: pattern.length - 1 }
}
const streakOf = (pattern: string) => {
  const { days, today } = history(pattern)
  return computeStreak(days, met, today)
}

describe('streak', () => {
  it('counts days in a row and is not broken by today', () => {
    expect(streakOf('xxx').days).toBe(3)
    expect(streakOf('xxx.').days).toBe(3) // today not done yet
    expect(streakOf('xx..').days).toBe(0) // yesterday missed, no freeze
  })

  it('earns a freeze every 7 days that saves a missed day', () => {
    expect(streakOf('xxxxxxx').freezes).toBe(1)
    const s = streakOf('xxxxxxx.xx')
    expect(s.days).toBe(9)
    expect(s.freezes).toBe(0)
    expect(s.frozen).toBe(1)
    expect(streakOf('xxxxxxx..xx').days).toBe(2) // second missed day breaks it
  })

  it('keeps at most two freezes', () => {
    expect(streakOf('x'.repeat(28)).freezes).toBe(2)
  })
})

describe('xp', () => {
  it('scores answers and learned words per day', () => {
    expect(answerXp({ correct: true })).toBe(XP.correct)
    expect(answerXp({ correct: true, almost: true })).toBe(XP.almost)
    expect(answerXp({ correct: false })).toBe(XP.wrong)
    const at = new Date(2026, 10, 9, 12).getTime()
    const r = (correct: boolean, responseMs: number) =>
      ({ id: '', wordId: '', deckId: '', mode: 'review', exercise: 'typing', correct, responseMs, at, updatedAt: 0 }) as const
    const day = activityByDay([r(true, 30_000), r(false, 10 * 60_000)], [{ learnedAt: at }]).get(dayKey(at))!
    expect(day.xp).toBe(XP.correct + XP.wrong + XP.learned)
    expect(day.answers).toBe(2)
    expect(day.minutes).toBeCloseTo(1.5) // the 10-minute answer counts as 1
  })
})

describe('mascot', () => {
  it('picks a mood for the home screen and a plant stage', async () => {
    const { homeMood, plantStage } = await import('../components/Mascot')
    expect(homeMood({ goalDone: true, answeredToday: 30, due: 5, hour: 20 })).toBe('party')
    expect(homeMood({ goalDone: false, answeredToday: 0, due: 5, hour: 20 })).toBe('angry')
    expect(homeMood({ goalDone: false, answeredToday: 0, due: 5, hour: 10 })).toBe('idle')
    expect(homeMood({ goalDone: false, answeredToday: 3, due: 0, hour: 21 })).toBe('sleep')
    expect([plantStage(0), plantStage(20), plantStage(150)]).toEqual(['g1', 'g2', 'g3'])
  })
})
