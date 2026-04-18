import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/adminAuth'
import { getXeroConnection } from '@/lib/xero'

/**
 * Lists supplier bills from the `xero_bill_cache` table, which the cron
 * refreshes from Xero at most once an hour. Reading from cache avoids
 * 1–3s of live-Xero latency on every Bills-page load.
 *
 * Auth: any logged-in user (guests included — bills are read-only data).
 *
 * Query params:
 *   dateFrom             - YYYY-MM-DD (invoice date)
 *   dateTo               - YYYY-MM-DD
 *   contactName          - substring filter (case-insensitive)
 *   withAttachmentsOnly  - 'false' to include bills without attachments
 *                          (default 'true' — matches the UI's needs)
 *
 * Returns { connected, bills, totalScanned } or
 * { connected: false } when no one has connected Xero yet.
 */
export async function GET(req: Request) {
  try {
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const { data: { user } } = await anonClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const conn = await getXeroConnection()
    if (!conn) {
      return NextResponse.json({ connected: false, bills: [] })
    }

    const url = new URL(req.url)
    const dateFrom = url.searchParams.get('dateFrom')?.trim() || null
    const dateTo = url.searchParams.get('dateTo')?.trim() || null
    const contactName = url.searchParams.get('contactName')?.trim() || null
    const withAttachmentsOnly = url.searchParams.get('withAttachmentsOnly') !== 'false'

    const supabase = adminClient()
    let query = supabase
      .from('xero_bill_cache')
      .select('xero_invoice_id, contact_name, invoice_number, reference, invoice_date, due_date, status, total, amount_due, amount_paid, currency_code, has_attachments')
      .order('invoice_date', { ascending: false })
      .limit(500)

    if (dateFrom) query = query.gte('invoice_date', dateFrom)
    if (dateTo) query = query.lte('invoice_date', dateTo)
    if (contactName) query = query.ilike('contact_name', `%${contactName}%`)
    if (withAttachmentsOnly) query = query.eq('has_attachments', true)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const bills = (data ?? []).map((r) => ({
      invoiceID: r.xero_invoice_id,
      invoiceNumber: r.invoice_number,
      reference: r.reference,
      contactName: r.contact_name,
      date: r.invoice_date,
      dueDate: r.due_date,
      status: r.status ?? '',
      total: Number(r.total ?? 0),
      amountDue: Number(r.amount_due ?? 0),
      amountPaid: Number(r.amount_paid ?? 0),
      currencyCode: r.currency_code ?? 'AUD',
      hasAttachments: !!r.has_attachments,
    }))

    return NextResponse.json({
      connected: true,
      tenantName: conn.tenant_name,
      bills,
      totalScanned: bills.length,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
