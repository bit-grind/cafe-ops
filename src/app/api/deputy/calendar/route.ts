import { NextResponse } from 'next/server'
import { adminClient, getSessionUser } from '@/lib/adminAuth'
import {
  activeEmployeeIds,
  employeeMap,
  eventOverlapsRange,
  normalizeAvailability,
  normalizeLeave,
  normalizeRoster,
  type DeputyCalendarEvent,
} from '@/lib/deputyCalendar'

export const dynamic = 'force-dynamic'

type DeputyRow = Record<string, unknown>

function dateParam(url: URL, key: string, fallback: string) {
  const value = url.searchParams.get(key)
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback
}

function defaultRange() {
  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - 14)
  const to = new Date(today)
  to.setDate(to.getDate() + 60)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

async function deputyGet(baseUrl: string, token: string, resource: string): Promise<DeputyRow[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/resource/${resource}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`${resource} returned ${res.status}`)
  const body = await res.json()
  return Array.isArray(body) ? body as DeputyRow[] : []
}

async function deputyQuery(baseUrl: string, token: string, resource: string, payload: Record<string, unknown>): Promise<DeputyRow[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/resource/${resource}/QUERY`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`${resource} returned ${res.status}`)
  const body = await res.json()
  return Array.isArray(body) ? body as DeputyRow[] : []
}

function offsetDate(date: string, days: number) {
  const next = new Date(`${date}T00:00:00+10:00`)
  next.setDate(next.getDate() + days)
  return next.toISOString().slice(0, 10)
}

function dateSearch(field: string, from: string, to: string) {
  return {
    search: {
      s1: { field, data: offsetDate(from, -1), type: 'gt' },
      s2: { field, data: offsetDate(to, 1), type: 'lt' },
    },
    sort: { [field]: 'asc' },
  }
}

async function loadDeputyEvents(from: string, to: string) {
  const baseUrl = process.env.DEPUTY_BASE_URL
  const token = process.env.DEPUTY_ACCESS_TOKEN
  if (!baseUrl || !token) {
    return {
      status: 'not_configured' as const,
      events: [] as DeputyCalendarEvent[],
      error: null as string | null,
    }
  }

  try {
    const [employees, leave, availability, roster] = await Promise.all([
      deputyGet(baseUrl, token, 'Employee'),
      deputyQuery(baseUrl, token, 'Leave', {
        search: {
          s1: { field: 'DateEnd', data: offsetDate(from, -1), type: 'gt' },
          s2: { field: 'DateStart', data: offsetDate(to, 1), type: 'lt' },
        },
        sort: { DateStart: 'asc' },
      }),
      deputyQuery(baseUrl, token, 'EmployeeAvailability', dateSearch('Date', from, to)),
      deputyQuery(baseUrl, token, 'Roster', dateSearch('Date', from, to)),
    ])
    const names = employeeMap(employees)
    const activeIds = activeEmployeeIds(employees)
    const events = [
      ...leave.map(row => normalizeLeave(row, names)),
      ...availability.map(row => normalizeAvailability(row, names)),
      ...roster.map(row => normalizeRoster(row, names)),
    ].filter(event => {
      return event.employeeId !== null
        && event.employeeId !== undefined
        && activeIds.has(event.employeeId)
        && eventOverlapsRange(event, from, to)
    })

    return { status: 'connected' as const, events, error: null }
  } catch (error) {
    return {
      status: 'error' as const,
      events: [] as DeputyCalendarEvent[],
      error: error instanceof Error ? error.message : 'Deputy request failed',
    }
  }
}

async function loadStoredEvents(from: string, to: string) {
  if (!process.env.DEPUTY_ZAPIER_WEBHOOK_SECRET) {
    return {
      status: 'not_configured' as const,
      events: [] as DeputyCalendarEvent[],
      error: null as string | null,
    }
  }

  const { data, error } = await adminClient()
    .from('deputy_calendar_events')
    .select('source,external_id,employee_id,employee_name,type,status,start_at,end_at,date_start,date_end,comment')
    .lte('date_start', to)
    .gte('date_end', from)
    .order('date_start', { ascending: true })

  if (error) {
    if (error.message.includes("Could not find the table 'public.deputy_calendar_events'")) {
      return {
        status: 'not_configured' as const,
        events: [] as DeputyCalendarEvent[],
        error: 'Apply the deputy calendar Supabase migration before using the Zapier webhook.',
      }
    }
    console.error('deputy_calendar_events lookup failed:', error.message)
    return { status: 'error' as const, events: [] as DeputyCalendarEvent[], error: error.message }
  }

  return {
    status: 'connected' as const,
    events: (data ?? []).map(row => ({
      id: `${row.source}-${row.type}-${row.external_id}`,
      source: row.source as 'deputy' | 'zapier',
      externalId: row.external_id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      type: row.type,
      status: row.status,
      start: row.start_at,
      end: row.end_at,
      dateStart: row.date_start,
      dateEnd: row.date_end,
      comment: row.comment,
    })) as DeputyCalendarEvent[],
    error: null,
  }
}

export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const defaults = defaultRange()
  const from = dateParam(url, 'from', defaults.from)
  const to = dateParam(url, 'to', defaults.to)

  const [stored, deputy] = await Promise.all([
    loadStoredEvents(from, to),
    loadDeputyEvents(from, to),
  ])
  const events = [...stored.events, ...deputy.events]
    .sort((a, b) => a.start.localeCompare(b.start) || a.employeeName.localeCompare(b.employeeName))

  return NextResponse.json({
    from,
    to,
    events,
    sources: {
      zapier: { status: stored.status, error: stored.error },
      deputy: { status: deputy.status, error: deputy.error },
    },
    fetched_at: new Date().toISOString(),
  })
}
