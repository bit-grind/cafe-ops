import { describe, expect, it } from 'vitest'
import { normalizeQueenslandCalendarHolidays } from '@/lib/queenslandCalendar'

describe('Queensland calendar holidays', () => {
  it('adds the Brisbane Royal Queensland Show public holiday', () => {
    const events = normalizeQueenslandCalendarHolidays('2026-08-01', '2026-08-31')

    expect(events).toContainEqual(expect.objectContaining({
      id: 'qld-public-holiday-2026-08-12-royal-queensland-show',
      source: 'queensland',
      employeeName: 'Royal Queensland Show',
      type: 'public_holiday',
      status: 'Brisbane area only',
      dateStart: '2026-08-12',
      dateEnd: '2026-08-12',
    }))
  })

  it('adds overlapping Queensland state school holiday ranges', () => {
    const events = normalizeQueenslandCalendarHolidays('2026-06-01', '2026-07-31')

    expect(events).toContainEqual(expect.objectContaining({
      id: 'qld-school-holiday-2026-06-27-2026-07-12',
      employeeName: 'School holidays',
      type: 'school_holiday',
      status: 'Term 2 school holidays',
      dateStart: '2026-06-27',
      dateEnd: '2026-07-12',
    }))
  })

  it('keeps Christmas Eve as a part-day public holiday', () => {
    const events = normalizeQueenslandCalendarHolidays('2026-12-24', '2026-12-24')

    expect(events).toContainEqual(expect.objectContaining({
      employeeName: 'Christmas Eve',
      type: 'public_holiday',
      status: '6pm to midnight',
      start: '2026-12-24T18:00:00+10:00',
      end: '2026-12-24T23:59:00+10:00',
    }))
  })

  it('adds weekday public holidays when Christmas and Boxing Day fall on a weekend', () => {
    const events = normalizeQueenslandCalendarHolidays('2027-12-25', '2027-12-28')

    expect(events.map(event => [event.employeeName, event.dateStart])).toEqual(expect.arrayContaining([
      ['Christmas Day', '2027-12-25'],
      ['Boxing Day', '2027-12-26'],
      ['Christmas Day public holiday', '2027-12-27'],
      ['Boxing Day public holiday', '2027-12-28'],
    ]))
  })
})
