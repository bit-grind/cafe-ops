export type DeputyCalendarEventType = 'leave' | 'unavailable' | 'available' | 'shift' | 'birthday' | 'public_holiday' | 'school_holiday'

export type DeputyCalendarEvent = {
  id: string
  source: 'deputy' | 'zapier' | 'queensland'
  externalId?: string | null
  employeeId?: number | null
  employeeName: string
  type: DeputyCalendarEventType
  status?: string | null
  areaId?: number | null
  areaName?: string | null
  areaColor?: string | null
  start: string
  end: string
  dateStart: string
  dateEnd: string
  comment?: string | null
}

type DeputyRecord = Record<string, unknown>

const LEAVE_STATUS: Record<number, string> = {
  0: 'Awaiting approval',
  1: 'Approved',
  2: 'Declined',
  3: 'Cancelled',
  4: 'Date approved',
  5: 'Pay approved',
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function colorValue(value: unknown): string | null {
  const raw = stringValue(value)
  return raw && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : null
}

function dateOnly(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const byType = new Map(parts.map(part => [part.type, part.value]))
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`
}

function datePartsValue(value: unknown): { year: number, month: number, day: number } | null {
  const raw = stringValue(value)
  if (!raw) return null
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function birthdayDateForYear(birthday: { month: number, day: number }, year: number): string {
  const day = birthday.month === 2 && birthday.day === 29 && !isLeapYear(year)
    ? 28
    : birthday.day
  return [
    year,
    String(birthday.month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

function localTimeParts(value: string): { hour: number, minute: number, second: number } | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const byType = new Map(parts.map(part => [part.type, part.value]))
  return {
    hour: Number(byType.get('hour')),
    minute: Number(byType.get('minute')),
    second: Number(byType.get('second')),
  }
}

function addIsoDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function fromUnix(value: unknown): string | null {
  const n = numberValue(value)
  if (!n) return null
  return new Date(n * 1000).toISOString()
}

function fromDate(value: unknown, endOfDay = false): string | null {
  const raw = stringValue(value)
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T${endOfDay ? '23:59:00' : '00:00:00'}+10:00`
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function pickStart(row: DeputyRecord): string {
  return fromUnix(row.Start)
    ?? fromUnix(row.StartTime)
    ?? fromUnix(row.DateStartTime)
    ?? fromDate(row.DateStart)
    ?? fromDate(row.Date)
    ?? new Date().toISOString()
}

function pickEnd(row: DeputyRecord, fallbackStart: string): string {
  return fromUnix(row.End)
    ?? fromUnix(row.EndTime)
    ?? fromUnix(row.DateEndTime)
    ?? fromDate(row.DateEnd, true)
    ?? fromDate(row.Date, true)
    ?? fallbackStart
}

function employeeName(row: DeputyRecord, employees: Map<number, string>): string {
  const employeeId = numberValue(row.Employee ?? row.EmployeeId ?? row.EmployeeID)
  if (employeeId && employees.has(employeeId)) return employees.get(employeeId)!
  return stringValue(row.EmployeeName)
    ?? stringValue(row.DisplayName)
    ?? stringValue(row.Name)
    ?? (employeeId ? `Employee #${employeeId}` : 'Team member')
}

export function employeeMap(rows: DeputyRecord[]): Map<number, string> {
  const map = new Map<number, string>()
  for (const row of rows) {
    const id = numberValue(row.Id)
    if (!id) continue
    if (row.Active === false) continue
    const fullName = [stringValue(row.FirstName), stringValue(row.LastName)].filter(Boolean).join(' ')
    const displayName = stringValue(row.DisplayName)
    const name = displayName ?? (fullName || `Employee #${id}`)
    map.set(id, name)
  }
  return map
}

export function activeEmployeeIds(rows: DeputyRecord[]): Set<number> {
  const ids = new Set<number>()
  for (const row of rows) {
    const id = numberValue(row.Id)
    if (!id || row.Active === false) continue
    ids.add(id)
  }
  return ids
}

export function operationalUnitMap(rows: DeputyRecord[]): Map<number, { name: string, color: string | null }> {
  const map = new Map<number, { name: string, color: string | null }>()
  for (const row of rows) {
    const id = numberValue(row.Id)
    if (!id) continue
    if (row.Active === false) continue
    const name = stringValue(row.OperationalUnitName) ?? stringValue(row.Name)
    if (name) map.set(id, { name, color: colorValue(row.Colour) })
  }
  return map
}

export function normalizeLeave(row: DeputyRecord, employees: Map<number, string>): DeputyCalendarEvent {
  const start = pickStart(row)
  const end = pickEnd(row, start)
  const employeeId = numberValue(row.Employee)
  const statusCode = numberValue(row.Status)
  const id = String(row.Id ?? `leave-${employeeId ?? 'unknown'}-${start}`)

  return {
    id: `deputy-leave-${id}`,
    source: 'deputy',
    externalId: id,
    employeeId,
    employeeName: employeeName(row, employees),
    type: 'leave',
    status: statusCode === null ? stringValue(row.Status) : LEAVE_STATUS[statusCode] ?? `Status ${statusCode}`,
    start,
    end,
    dateStart: dateOnly(start),
    dateEnd: dateOnly(end),
    comment: stringValue(row.Comment) ?? stringValue(row.ApprovalComment),
  }
}

export function normalizeAvailability(row: DeputyRecord, employees: Map<number, string>): DeputyCalendarEvent {
  const start = pickStart(row)
  const end = pickEnd(row, start)
  const employeeId = numberValue(row.Employee ?? row.EmployeeId ?? row.EmployeeID)
  const id = String(row.Id ?? `availability-${employeeId ?? 'unknown'}-${start}`)
  const availability = String(row.Availability ?? row.Type ?? row.IsAvailable ?? row.Unavailable ?? '').toLowerCase()
  const isAvailable = availability === 'available' || availability === 'true' || availability === '1'

  return {
    id: `deputy-availability-${id}`,
    source: 'deputy',
    externalId: id,
    employeeId,
    employeeName: employeeName(row, employees),
    type: isAvailable ? 'available' : 'unavailable',
    status: stringValue(row.Status),
    start,
    end,
    dateStart: availabilityDateStart(row, start),
    dateEnd: availabilityDateEnd(row, start, end),
    comment: stringValue(row.Comment) ?? stringValue(row.Reason),
  }
}

function availabilityDateStart(row: DeputyRecord, fallbackStart: string): string {
  const date = fromDate(row.Date)
  return date ? dateOnly(date) : dateOnly(fallbackStart)
}

function availabilityDateEnd(row: DeputyRecord, fallbackStart: string, end: string): string {
  const startDate = availabilityDateStart(row, fallbackStart)
  const endDate = dateOnly(end)
  const endParts = localTimeParts(end)
  const endsAtMidnight = endParts?.hour === 0 && endParts.minute === 0 && endParts.second === 0
  if (endsAtMidnight && endDate > startDate) return addIsoDays(endDate, -1)
  return endDate < startDate ? startDate : endDate
}

export function isUnavailableRecord(row: DeputyRecord): boolean {
  const type = numberValue(row.Type)
  return type === null || type === 0 || type === 1 || type === 2
}

export function isRosterShift(row: DeputyRecord): boolean {
  return row.Open !== true && row.Published !== false
}

export function normalizeRoster(row: DeputyRecord, employees: Map<number, string>, areas = new Map<number, { name: string, color: string | null }>()): DeputyCalendarEvent {
  const start = pickStart(row)
  const end = pickEnd(row, start)
  const employeeId = numberValue(row.Employee ?? row.EmployeeId ?? row.EmployeeID)
  const areaId = numberValue(row.OperationalUnit ?? row.OperationalUnitId ?? row.OperationalUnitID)
  const area = areaId ? areas.get(areaId) : null
  const id = String(row.Id ?? `roster-${employeeId ?? 'unknown'}-${start}`)
  const rosterDate = stringValue(row.Date)
  const dateStart = rosterDate ? dateOnly(rosterDate) : dateOnly(start)
  const dateEnd = dateOnly(end)

  return {
    id: `deputy-roster-${id}`,
    source: 'deputy',
    externalId: id,
    employeeId,
    employeeName: employeeName(row, employees),
    type: 'shift',
    status: stringValue(row.Status) ?? stringValue(row.Published),
    areaId,
    areaName: area?.name ?? null,
    areaColor: area?.color ?? null,
    start,
    end,
    dateStart,
    dateEnd: dateEnd < dateStart ? dateStart : dateEnd,
    comment: stringValue(row.Comment),
  }
}

export function normalizeEmployeeBirthdays(rows: DeputyRecord[], from: string, to: string): DeputyCalendarEvent[] {
  const events: DeputyCalendarEvent[] = []
  const fromYear = Number(from.slice(0, 4))
  const toYear = Number(to.slice(0, 4))
  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear)) return events

  const names = employeeMap(rows)
  for (const row of rows) {
    if (row.Active === false) continue
    const employeeId = numberValue(row.Id)
    if (!employeeId) continue
    const birthday = datePartsValue(row.DateOfBirth)
    if (!birthday) continue

    for (let year = fromYear; year <= toYear; year += 1) {
      const date = birthdayDateForYear(birthday, year)
      if (date < from || date > to) continue
      events.push({
        id: `deputy-birthday-${employeeId}-${date}`,
        source: 'deputy',
        externalId: `birthday-${employeeId}`,
        employeeId,
        employeeName: names.get(employeeId) ?? employeeName(row, names),
        type: 'birthday',
        status: null,
        areaId: null,
        areaName: null,
        areaColor: null,
        start: `${date}T00:00:00+10:00`,
        end: `${date}T23:59:00+10:00`,
        dateStart: date,
        dateEnd: date,
        comment: null,
      })
    }
  }

  return events.sort((a, b) => a.dateStart.localeCompare(b.dateStart) || a.employeeName.localeCompare(b.employeeName))
}

export function normalizeZapierEvent(payload: DeputyRecord): DeputyCalendarEvent {
  const typeRaw = String(payload.type ?? payload.event_type ?? payload.EventType ?? payload.kind ?? 'leave').toLowerCase()
  const type: DeputyCalendarEventType = typeRaw.includes('available') && !typeRaw.includes('unavailable')
    ? 'available'
    : typeRaw.includes('shift')
      ? 'shift'
      : typeRaw.includes('unavailable')
        ? 'unavailable'
        : 'leave'
  const start = pickStart({
    Start: payload.start_unix ?? payload.Start,
    StartTime: payload.start_time ?? payload.StartTime,
    DateStart: payload.date_start ?? payload.DateStart ?? payload.start_date,
    Date: payload.date,
  })
  const end = pickEnd({
    End: payload.end_unix ?? payload.End,
    EndTime: payload.end_time ?? payload.EndTime,
    DateEnd: payload.date_end ?? payload.DateEnd ?? payload.end_date,
    Date: payload.date,
  }, start)
  const employeeId = numberValue(payload.employee_id ?? payload.Employee)
  const externalId = stringValue(payload.external_id ?? payload.Id ?? payload.id) ?? `${type}-${employeeId ?? 'unknown'}-${start}`

  return {
    id: `zapier-${type}-${externalId}`,
    source: 'zapier',
    externalId,
    employeeId,
    employeeName: stringValue(payload.employee_name ?? payload.EmployeeName ?? payload.name) ?? (employeeId ? `Employee #${employeeId}` : 'Team member'),
    type,
    status: stringValue(payload.status ?? payload.Status),
    start,
    end,
    dateStart: dateOnly(start),
    dateEnd: dateOnly(end),
    comment: stringValue(payload.comment ?? payload.Comment ?? payload.reason),
  }
}

export function eventOverlapsRange(event: DeputyCalendarEvent, from: string, to: string): boolean {
  return event.dateEnd >= from && event.dateStart <= to
}
