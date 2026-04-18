import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/adminAuth'

/**
 * Weekly supplier cost from `xero_bill_cache`.
 *
 * Sums bill totals by invoice_date, bucketed into Mon–Sun weeks. Uses
 * the service-role client because xero_bill_cache has RLS enabled
 * without a read policy. Session auth is still required.
 */

function mondayOf(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(req: Request) {
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const weeks = Math.min(Math.max(parseInt(url.searchParams.get('weeks') || '12', 10) || 12, 1), 104)

  const today = new Date()
  const currentMon = mondayOf(today)
  const fromDate = new Date(currentMon)
  fromDate.setDate(fromDate.getDate() - 7 * (weeks - 1))
  const fromIso = iso(fromDate)

  const db = adminClient()

  // Pull bills in window. 500 cap aligns with the Bills page; bump if needed.
  const { data: bills, error } = await db
    .from('xero_bill_cache')
    .select('invoice_date, total')
    .gte('invoice_date', fromIso)
    .order('invoice_date', { ascending: true })
    .limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const weekTotals = new Map<string, number>()
  for (const b of bills ?? []) {
    if (!b.invoice_date) continue
    const mon = iso(mondayOf(new Date(b.invoice_date + 'T00:00:00')))
    weekTotals.set(mon, (weekTotals.get(mon) ?? 0) + Number(b.total ?? 0))
  }

  const out: { week_start: string; week_end: string; total: number }[] = []
  for (let i = 0; i < weeks; i++) {
    const start = new Date(currentMon)
    start.setDate(start.getDate() - 7 * (weeks - 1 - i))
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const key = iso(start)
    out.push({
      week_start: key,
      week_end: iso(end),
      total: Math.round((weekTotals.get(key) ?? 0) * 100) / 100,
    })
  }

  return NextResponse.json({ weeks: out })
}
