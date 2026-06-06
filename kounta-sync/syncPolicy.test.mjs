import { describe, expect, it } from 'vitest'
import { shouldSkipMissingCurrentDaySummary } from './syncPolicy.mjs'

const currentDay = {
  allowMissingCurrentDay: true,
  from: '2026-06-07',
  to: '2026-06-07',
  today: '2026-06-07',
  missingDays: ['2026-06-07'],
}

describe('shouldSkipMissingCurrentDaySummary', () => {
  it('skips an opted-in live refresh before Kounta creates today', () => {
    expect(shouldSkipMissingCurrentDaySummary(currentDay)).toBe(true)
  })

  it('keeps manual and final syncs strict', () => {
    expect(shouldSkipMissingCurrentDaySummary({
      ...currentDay,
      allowMissingCurrentDay: false,
    })).toBe(false)
  })

  it('keeps historical and multi-day syncs strict', () => {
    expect(shouldSkipMissingCurrentDaySummary({
      ...currentDay,
      from: '2026-06-06',
      to: '2026-06-06',
      missingDays: ['2026-06-06'],
    })).toBe(false)

    expect(shouldSkipMissingCurrentDaySummary({
      ...currentDay,
      from: '2026-06-06',
      missingDays: ['2026-06-06', '2026-06-07'],
    })).toBe(false)
  })
})
