export type DeputyCalendarEventType = 'leave' | 'unavailable' | 'available' | 'shift'

export type DeputyCalendarEvent = {
  id: string
  source: 'deputy' | 'zapier'
  externalId?: string | null
  employeeId?: number | null
  employeeName: string
  type: DeputyCalendarEventType
  status?: string | null
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

function dateOnly(value: string): string {
  return value.slice(0, 10)
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
    dateStart: dateOnly(start),
    dateEnd: dateOnly(end),
    comment: stringValue(row.Comment) ?? stringValue(row.Reason),
  }
}

export function normalizeRoster(row: DeputyRecord, employees: Map<number, string>): DeputyCalendarEvent {
  const start = pickStart(row)
  const end = pickEnd(row, start)
  const employeeId = numberValue(row.Employee ?? row.EmployeeId ?? row.EmployeeID)
  const id = String(row.Id ?? `roster-${employeeId ?? 'unknown'}-${start}`)

  return {
    id: `deputy-roster-${id}`,
    source: 'deputy',
    externalId: id,
    employeeId,
    employeeName: employeeName(row, employees),
    type: 'shift',
    status: stringValue(row.Status) ?? stringValue(row.Published),
    start,
    end,
    dateStart: dateOnly(start),
    dateEnd: dateOnly(end),
    comment: stringValue(row.Comment),
  }
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
