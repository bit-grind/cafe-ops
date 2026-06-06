import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { normalizeZapierEvent } from '@/lib/deputyCalendar'

export const dynamic = 'force-dynamic'

// Constant-time compare that never short-circuits on length.
function secretsMatch(supplied: string, expected: string) {
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function hasValidSecret(req: Request) {
  const expected = process.env.DEPUTY_ZAPIER_WEBHOOK_SECRET
  if (!expected) return false
  // Header only — a secret in the query string leaks into request logs.
  const supplied = req.headers.get('x-deputy-calendar-secret')
  return typeof supplied === 'string' && secretsMatch(supplied, expected)
}

export async function POST(req: Request) {
  if (!hasValidSecret(req)) {
    return NextResponse.json({ error: 'Webhook secret is missing or invalid' }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Expected JSON payload' }, { status: 400 })
  }

  const event = normalizeZapierEvent(payload)
  const { error } = await adminClient()
    .from('deputy_calendar_events')
    .upsert({
      source: 'zapier',
      external_id: event.externalId,
      employee_id: event.employeeId,
      employee_name: event.employeeName,
      type: event.type,
      status: event.status,
      start_at: event.start,
      end_at: event.end,
      date_start: event.dateStart,
      date_end: event.dateEnd,
      comment: event.comment,
      raw: payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'source,external_id,type' })

  if (error) {
    if (error.message.includes("Could not find the table 'public.deputy_calendar_events'")) {
      return NextResponse.json({
        error: 'Apply supabase/migrations/202606050002_deputy_calendar_events.sql before using this webhook.',
      }, { status: 503 })
    }
    return NextResponse.json({ error: 'Failed to store calendar event' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, event })
}
