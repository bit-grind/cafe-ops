import { describe, expect, it } from 'vitest'
import { isRosterShift, isUnavailableRecord, normalizeAvailability, normalizeEmployeeBirthdays, normalizeRoster } from '@/lib/deputyCalendar'

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

  it('creates birthday events for active employees in the requested range', () => {
    const events = normalizeEmployeeBirthdays([
      {
        Id: 12,
        FirstName: 'June',
        LastName: 'Vale',
        Active: true,
        DateOfBirth: '1994-06-12T00:00:00+10:00',
      },
      {
        Id: 13,
        FirstName: 'Inactive',
        LastName: 'Person',
        Active: false,
        DateOfBirth: '1990-06-12T00:00:00+10:00',
      },
    ], '2026-06-01', '2026-06-30')

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      id: 'deputy-birthday-12-2026-06-12',
      employeeId: 12,
      employeeName: 'June Vale',
      type: 'birthday',
      dateStart: '2026-06-12',
      dateEnd: '2026-06-12',
      start: '2026-06-12T00:00:00+10:00',
      end: '2026-06-12T23:59:00+10:00',
    })
  })

  it('shows leap-day birthdays on February 28 in non-leap years', () => {
    const events = normalizeEmployeeBirthdays([
      {
        Id: 18,
        DisplayName: 'Leap Day',
        Active: true,
        DateOfBirth: '2000-02-29',
      },
    ], '2025-02-01', '2025-02-28')

    expect(events).toHaveLength(1)
    expect(events[0].dateStart).toBe('2025-02-28')
  })
})
