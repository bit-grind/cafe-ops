import type { DeputyCalendarEventType } from '@/lib/deputyCalendar'

export type TeamCalendarFilter = DeputyCalendarEventType | 'holiday' | 'leave_unavailable'

export function matchesTeamCalendarFilter(type: DeputyCalendarEventType, filter: TeamCalendarFilter) {
  if (filter === 'holiday') return type === 'public_holiday' || type === 'school_holiday'
  if (filter === 'leave_unavailable') return type === 'leave' || type === 'unavailable'
  return type === filter
}
