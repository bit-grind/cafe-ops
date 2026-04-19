/**
 * Shared date helpers used by server routes and client pages.
 * Week boundaries are Mon–Sun in Australia/Sydney, computed explicitly
 * so the result is correct regardless of the host's local timezone
 * (Vercel serverless runs in UTC, not the region's local time).
 */

const SYD_TZ = 'Australia/Sydney'

type SydParts = { y: number; m: number; d: number; weekday: number }

function sydneyParts(d: Date): SydParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SYD_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)!.value
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    weekday: weekdays[get('weekday')],
  }
}

export function mondayOf(d: Date): Date {
  const { y, m, d: day, weekday } = sydneyParts(d)
  const diff = weekday === 0 ? -6 : 1 - weekday
  // Construct a UTC date at midnight for the Sydney calendar day, then
  // shift to the Monday. The returned Date's isoDate() is stable because
  // isoDate reads the same Sydney calendar fields.
  const base = new Date(Date.UTC(y, m - 1, day + diff))
  return base
}

export function isoDate(d: Date): string {
  const { y, m, d: day } = sydneyParts(d)
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
