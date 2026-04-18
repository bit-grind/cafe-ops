import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { listBills } from '@/lib/xero'

export const maxDuration = 60

/**
 * POST /api/extract-lines/refresh-cache?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 *
 * Populates xero_bill_cache with bills matching a date range.
 * Protected by CRON_SECRET. Use this to add historical periods to the
 * extraction queue — the normal cron will then process them.
 *
 * Pages through Xero (1 API call per page, up to 20 pages = 2000 bills).
 * Returns immediately on 429 so we don't waste quota.
 */
export async function POST(req: Request) {
  const start = Date.now()
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
    }
    const provided =
      req.headers.get('x-cron-secret') ??
      req.headers.get('authorization')?.replace('Bearer ', '')
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const dateFrom = url.searchParams.get('dateFrom') ?? undefined
    const dateTo = url.searchParams.get('dateTo') ?? undefined

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'dateFrom and dateTo query params are required (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const supabase = adminClient()
    const TIME_BUDGET_MS = 50_000
    const all: Array<{
      invoiceID: string; contactName: string;
      invoiceNumber: string | null; date: string; hasAttachments: boolean
    }> = []

    let pagesFetched = 0
    let lastPageSize = 0
    for (let page = 1; page <= 20; page++) {
      if (Date.now() - start > TIME_BUDGET_MS) break
      try {
        const bills = await listBills({ dateFrom, dateTo, page })
        pagesFetched++
        lastPageSize = bills.length
        if (bills.length === 0) break
        all.push(...bills)
        if (bills.length < 100) break
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        if (msg.includes('429')) {
          return NextResponse.json({
            partial: true,
            pagesFetched,
            billsFound: all.length,
            message: `Rate limited after ${pagesFetched} pages — run again later to continue`,
            error: msg,
          })
        }
        throw e
      }
    }

    if (all.length === 0) {
      return NextResponse.json({ pagesFetched, billsFound: 0, inserted: 0 })
    }

    const { error } = await supabase.from('xero_bill_cache').upsert(
      all.map((b) => ({
        xero_invoice_id: b.invoiceID,
        contact_name: b.contactName,
        invoice_number: b.invoiceNumber,
        invoice_date: b.date,
        has_attachments: b.hasAttachments,
        last_synced_at: new Date().toISOString(),
      }))
    )
    if (error) throw new Error(error.message)

    const withAttachments = all.filter((b) => b.hasAttachments).length

    return NextResponse.json({
      pagesFetched,
      lastPageSize,
      billsFound: all.length,
      billsWithAttachments: withAttachments,
      dateRange: { from: dateFrom, to: dateTo },
      elapsed: `${((Date.now() - start) / 1000).toFixed(1)}s`,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json(
      { error: msg, elapsed: `${((Date.now() - start) / 1000).toFixed(1)}s` },
      { status: 500 }
    )
  }
}
