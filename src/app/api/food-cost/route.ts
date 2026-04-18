import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/adminAuth'

/**
 * Weekly food cost from supplier bills (Xero).
 *
 * Joins `extracted_line_items` against `xero_bill_cache` to get per-line
 * costs with invoice dates, filters to food/COGS categories (excludes
 * cleaning/packaging/equipment/other), then buckets by Mon–Sun week.
 *
 * Both tables have RLS enabled without read policies, so this runs with
 * the service-role client. We still require an authenticated session.
 */

// Categories counted as food cost / COGS. Kept as a set for O(1) lookup.
const FOOD_CATEGORIES = new Set<string>([
  'produce',
  'bakery',
  'dairy',
  'dry-goods',
  'meat',
  'seafood',
  'beverages',
  'frozen food',
  'frozen-food',
  'frozen',
])

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
  const weeks = Math.min(Math.max(parseInt(url.searchParams.get('weeks') || '12', 10) || 12, 1), 52)

  const today = new Date()
  const currentMon = mondayOf(today)
  const fromDate = new Date(currentMon)
  fromDate.setDate(fromDate.getDate() - 7 * (weeks - 1))
  const fromIso = iso(fromDate)

  const db = adminClient()

  // Pull bills in the window so we can map invoice_id -> invoice_date.
  const { data: bills, error: billsErr } = await db
    .from('xero_bill_cache')
    .select('xero_invoice_id, invoice_date')
    .gte('invoice_date', fromIso)
  if (billsErr) return NextResponse.json({ error: billsErr.message }, { status: 500 })

  const invoiceDate = new Map<string, string>()
  for (const b of bills ?? []) {
    if (b.xero_invoice_id && b.invoice_date) invoiceDate.set(b.xero_invoice_id, b.invoice_date)
  }
  if (invoiceDate.size === 0) {
    return NextResponse.json({ weeks: [] })
  }

  // Pull line items for those invoices. Chunk the `in` filter to keep URLs
  // under the practical query-string length.
  const invoiceIds = [...invoiceDate.keys()]
  const CHUNK = 200
  type LineRow = { xero_invoice_id: string; total: number | null; category: string | null }
  const allLines: LineRow[] = []
  for (let i = 0; i < invoiceIds.length; i += CHUNK) {
    const chunk = invoiceIds.slice(i, i + CHUNK)
    const { data, error } = await db
      .from('extracted_line_items')
      .select('xero_invoice_id, total, category')
      .in('xero_invoice_id', chunk)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (data) allLines.push(...(data as LineRow[]))
  }

  // Bucket by Mon–Sun week.
  const weekTotals = new Map<string, number>()
  for (const line of allLines) {
    const cat = (line.category ?? '').toLowerCase()
    if (!FOOD_CATEGORIES.has(cat)) continue
    const date = invoiceDate.get(line.xero_invoice_id)
    if (!date) continue
    const mon = iso(mondayOf(new Date(date + 'T00:00:00')))
    weekTotals.set(mon, (weekTotals.get(mon) ?? 0) + Number(line.total ?? 0))
  }

  // Emit one row per week in the window, even if empty.
  const out: { week_start: string; week_end: string; total: number }[] = []
  for (let i = 0; i < weeks; i++) {
    const start = new Date(currentMon)
    start.setDate(start.getDate() - 7 * (weeks - 1 - i))
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const key = iso(start)
    out.push({ week_start: key, week_end: iso(end), total: Math.round((weekTotals.get(key) ?? 0) * 100) / 100 })
  }

  return NextResponse.json({ weeks: out })
}
