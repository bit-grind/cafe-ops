import { describe, expect, it } from 'vitest'
import { isRosterShift, normalizeRoster } from '@/lib/deputyCalendar'

describe('Deputy roster calendar normalization', () => {
  it('keeps early Brisbane shifts on their rostered local day', () => {
    const event = normalizeRoster({
      Id: 1,
      Employee: 42,
      Date: '2026-04-30T00:00:00+10:00',
      StartTime: Date.parse('2026-04-30T05:15:00+10:00') / 1000,
      EndTime: Date.parse('2026-04-30T11:30:00+10:00') / 1000,
      Published: true,
      Open: false,
    }, new Map([[42, 'Amy Deacon']]))

    expect(event.dateStart).toBe('2026-04-30')
    expect(event.dateEnd).toBe('2026-04-30')
    expect(event.employeeName).toBe('Amy Deacon')
  })

  it('ignores open or unpublished roster rows', () => {
    expect(isRosterShift({ Open: true, Published: true })).toBe(false)
    expect(isRosterShift({ Open: false, Published: false })).toBe(false)
    expect(isRosterShift({ Open: false, Published: true })).toBe(true)
  })
})
