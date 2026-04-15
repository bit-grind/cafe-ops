import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listAllBills, getXeroConnection } from '@/lib/xero'

/**
 * Lists supplier bills (ACCPAY invoices) from the connected Xero tenant.
 *
 * Auth: any logged-in user (guests included — bills are read-only data).
 *
 * Query params:
 *   status               - AUTHORISED | PAID | DRAFT | SUBMITTED | VOIDED
 *   dateFrom             - YYYY-MM-DD
 *   dateTo               - YYYY-MM-DD
 *   contactName          - substring filter (case-insensitive)
 *   maxPages             - cap on how many 100-result Xero pages to walk
 *                          (default 5 = up to 500 bills scanned)
 *   withAttachmentsOnly  - 'false' to include bills without attachments
 *                          (default 'true' — only attachment-bearing bills)
 *
 * Returns { connected, tenantName, bills, totalScanned } or
 * { connected: false } when the admin hasn't connected Xero yet.
 */
export async function GET(req: Request) {
  try {
    // Auth — match the /api/ask pattern
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
    const maxPagesRaw = url.searchParams.get('maxPages')
    const maxPages = maxPagesRaw ? Math.min(Math.max(parseInt(maxPagesRaw, 10) || 5, 1), 50) : 5
    const allBills = await listAllBills(
      {
        status: url.searchParams.get('status') ?? undefined,
        dateFrom: url.searchParams.get('dateFrom') ?? undefined,
        dateTo: url.searchParams.get('dateTo') ?? undefined,
        contactName: url.searchParams.get('contactName') ?? undefined,
      },
      { maxPages }
    )

    // Only show bills that actually have an attached invoice file in Xero —
    // those are the ones the modal can render. Pass ?withAttachmentsOnly=false
    // to disable this filter (e.g. for Ask AI).
    const withAttachmentsOnly = url.searchParams.get('withAttachmentsOnly') !== 'false'
    const bills = withAttachmentsOnly
      ? allBills.filter((b) => b.hasAttachments)
      : allBills

    return NextResponse.json({
      connected: true,
      tenantName: conn.tenant_name,
      bills,
      totalScanned: allBills.length,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
