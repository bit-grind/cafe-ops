import { describe, expect, it } from 'vitest'
import { isRosterShift, isUnavailableRecord, normalizeAvailability, normalizeRoster } from '@/lib/deputyCalendar'

describe('Deputy roster calendar normalization', () => {
  it('keeps early Brisbane shifts on their rostered local day', () => {
    const event = normalizeRoster({
      Id: 1,
      Employee: 42,
      Date: '2026-04-30T00:00:00+10:00',
      StartTime: Date.parse('2026-04-30T05:15:00+10:00') / 1000,
      EndTime: Date.parse('2026-04-30T11:30:00+10:00') / 1000,
      OperationalUnit: 4,
      Published: true,
      Open: false,
    }, new Map([[42, 'Amy Deacon']]), new Map([[4, { name: 'Barista', color: '#445bff' }]]))

    expect(event.dateStart).toBe('2026-04-30')
    expect(event.dateEnd).toBe('2026-04-30')
    expect(event.employeeName).toBe('Amy Deacon')
    expect(event.areaName).toBe('Barista')
    expect(event.areaColor).toBe('#445bff')
  })

  it('ignores open or unpublished roster rows', () => {
    expect(isRosterShift({ Open: true, Published: true })).toBe(false)
    expect(isRosterShift({ Open: false, Published: false })).toBe(false)
    expect(isRosterShift({ Open: false, Published: true })).toBe(true)
  })

  it('keeps all-day unavailability on the Deputy date only when it ends at midnight', () => {
    const event = normalizeAvailability({
      Id: 21457,
      Employee: 455,
      Date: '2026-06-04T00:00:00+10:00',
      StartTime: Date.parse('2026-06-04T00:00:00+10:00') / 1000,
      EndTime: Date.parse('2026-06-05T00:00:00+10:00') / 1000,
      Type: 2,
    }, new Map([[455, 'Olive McCagh']]))

    expect(event.type).toBe('unavailable')
    expect(event.dateStart).toBe('2026-06-04')
    expect(event.dateEnd).toBe('2026-06-04')
  })

  it('does not treat Deputy availability type overrides as unavailability', () => {
    expect(isUnavailableRecord({ Type: 0 })).toBe(true)
    expect(isUnavailableRecord({ Type: 1 })).toBe(true)
    expect(isUnavailableRecord({ Type: 2 })).toBe(true)
    expect(isUnavailableRecord({ Type: 5 })).toBe(false)
    expect(isUnavailableRecord({ Type: 7 })).toBe(false)
  })
})
