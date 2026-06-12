import { describe, expect, it } from 'vitest'
import { matchesTeamCalendarFilter } from './calendarFilters'

describe('matchesTeamCalendarFilter', () => {
  it('combines leave and unavailable events', () => {
    expect(matchesTeamCalendarFilter('leave', 'leave_unavailable')).toBe(true)
    expect(matchesTeamCalendarFilter('unavailable', 'leave_unavailable')).toBe(true)
    expect(matchesTeamCalendarFilter('available', 'leave_unavailable')).toBe(false)
  })

  it('combines public and school holidays', () => {
    expect(matchesTeamCalendarFilter('public_holiday', 'holiday')).toBe(true)
    expect(matchesTeamCalendarFilter('school_holiday', 'holiday')).toBe(true)
    expect(matchesTeamCalendarFilter('leave', 'holiday')).toBe(false)
  })

  it('matches individual event filters exactly', () => {
    expect(matchesTeamCalendarFilter('shift', 'shift')).toBe(true)
    expect(matchesTeamCalendarFilter('birthday', 'shift')).toBe(false)
  })
})
