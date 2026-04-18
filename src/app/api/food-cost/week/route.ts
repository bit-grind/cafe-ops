import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/adminAuth'
import { isKitchenSupplierBill } from '@/lib/suppliers'

/**
 * Supplier bills for a single Mon–Sun week. Used by the kitchen
 * dashboard to drill into a week's total.
 */
export async function GET(req: Request) {
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const start = url.searchParams.get('start') // yyyy-mm-dd Monday
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return NextResponse.json({ error: 'start required (yyyy-mm-dd)' }, { status: 400 })
  }

  const startDate = new Date(start + 'T00:00:00')
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 6)
  const endIso = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`

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
