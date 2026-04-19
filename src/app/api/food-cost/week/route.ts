import { NextResponse } from 'next/server'
import { adminClient, getSessionUser } from '@/lib/adminAuth'
import { mondayOf, isoDate } from '@/lib/dates'
import { isKitchenSupplierBill } from '@/lib/suppliers'

/**
 * Supplier bills for a single Mon–Sun week. Used by the kitchen
 * dashboard to drill into a week's total. Guests are denied.
 */
export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const start = url.searchParams.get('start')
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return NextResponse.json({ error: 'start required (yyyy-mm-dd)' }, { status: 400 })
  }
  // Reject non-Mondays so every response covers a canonical Mon–Sun
  // window, matching the aggregator's bucketing.
  const startDate = new Date(start + 'T00:00:00')
  if (isoDate(mondayOf(startDate)) !== start) {
    return NextResponse.json({ error: 'start must be a Monday (yyyy-mm-dd)' }, { status: 400 })
  }

  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 6)
  const endIso = isoDate(endDate)

  const db = adminClient()
  const { data, error } = await db
    .from('xero_bill_cache')
    .select('xero_invoice_id, contact_name, invoice_number, reference, invoice_date, total, status, has_attachments')
    .gte('invoice_date', start)
    .lte('invoice_date', endIso)
    .order('invoice_date', { ascending: true })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bills = (data ?? [])
    .filter(r => isKitchenSupplierBill(r.contact_name, r.invoice_number))
    .map(r => ({
      invoiceID: r.xero_invoice_id,
      invoiceNumber: r.invoice_number,
      reference: r.reference,
      contactName: r.contact_name,
      date: r.invoice_date,
      total: Number(r.total ?? 0),
      status: r.status ?? '',
      hasAttachments: !!r.has_attachments,
    }))

  return NextResponse.json({ bills })
}
