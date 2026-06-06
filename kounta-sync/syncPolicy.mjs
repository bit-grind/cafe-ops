export function shouldSkipMissingCurrentDaySummary({
  allowMissingCurrentDay,
  from,
  to,
  today,
  missingDays,
}) {
  return allowMissingCurrentDay
    && from === to
    && to === today
    && missingDays.length === 1
    && missingDays[0] === today
}
