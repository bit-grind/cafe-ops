import { NextResponse } from 'next/server'
import { adminClient, getSessionUser } from '@/lib/adminAuth'
import { mondayOf, isoDate } from '@/lib/dates'
import { isKitchenSupplierBill } from '@/lib/suppliers'

/**
 * Weekly supplier cost from `xero_bill_cache`.
 *
 * Sums bill totals by invoice_date, bucketed into Mon–Sun weeks. Uses
 * the service-role client because xero_bill_cache has RLS enabled
 * without a read policy — authz is enforced here. Guests are denied
 * because supplier-cost totals are sensitive.
 *
 * Week boundaries are in the server's local timezone (Sydney on Vercel,
 * see vercel.json).
 */
export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const weeksRaw = Number.parseInt(url.searchParams.get('weeks') ?? '', 10)
  const weeks = Number.isFinite(weeksRaw) ? Math.min(Math.max(weeksRaw, 1), 104) : 12

  const currentMon = mondayOf(new Date())
  const fromDate = new Date(currentMon)
  fromDate.setDate(fromDate.getDate() - 7 * (weeks - 1))
  const fromIso = isoDate(fromDate)

  // 104 weeks × ~50 supplier bills/week ≈ 5,200 rows worst case; pick a
  // generous cap so the 52w range on a busy quarter doesn't silently
  // truncate.
  const db = adminClient()
  const { data: bills, error } = await db
    .from('xero_bill_cache')
    .select('invoice_date, total, contact_name, invoice_number')
    .gte('invoice_date', fromIso)
    .order('invoice_date', { ascending: true })
    .limit(10000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const weekTotals = new Map<string, number>()
  for (const b of bills ?? []) {
    if (!b.invoice_date) continue
    if (!isKitchenSupplierBill(b.contact_name, b.invoice_number)) continue
    const mon = isoDate(mondayOf(new Date(b.invoice_date + 'T00:00:00')))
    weekTotals.set(mon, (weekTotals.get(mon) ?? 0) + Number(b.total ?? 0))
  }

  const out: { week_start: string; week_end: string; total: number }[] = []
  for (let i = 0; i < weeks; i++) {
    const start = new Date(currentMon)
    start.setDate(start.getDate() - 7 * (weeks - 1 - i))
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const key = isoDate(start)
    out.push({
      week_start: key,
      week_end: isoDate(end),
      total: Math.round((weekTotals.get(key) ?? 0) * 100) / 100,
    })
  }

  return NextResponse.json({ weeks: out })
}
