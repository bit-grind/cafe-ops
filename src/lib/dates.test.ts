import { describe, it, expect } from 'vitest'
import { isoDate, mondayOf } from '@/lib/dates'

describe('isoDate', () => {
  it('formats an instant as the Sydney calendar date', () => {
    // 03:00 UTC on 2026-04-08 is mid-afternoon in Sydney → same calendar day.
    expect(isoDate(new Date('2026-04-08T03:00:00Z'))).toBe('2026-04-08')
  })
})

describe('mondayOf', () => {
  it('returns Monday for a mid-week day', () => {
    // 2026-04-08 is a Wednesday → week starts Monday 2026-04-06.
    expect(isoDate(mondayOf(new Date('2026-04-08T03:00:00Z')))).toBe('2026-04-06')
  })

  it('returns the same day when given a Monday', () => {
    expect(isoDate(mondayOf(new Date('2026-04-06T03:00:00Z')))).toBe('2026-04-06')
  })

  it('treats Sunday as the last day of the week', () => {
    // 2026-04-12 is a Sunday → its week still starts Monday 2026-04-06.
    expect(isoDate(mondayOf(new Date('2026-04-12T03:00:00Z')))).toBe('2026-04-06')
  })
})
