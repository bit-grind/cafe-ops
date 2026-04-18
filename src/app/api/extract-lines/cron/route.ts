import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { extractLinesFromInvoice } from '@/lib/extractLines'
import { listBills } from '@/lib/xero'

export const maxDuration = 60

// Time budget within the 60s function limit
const TIME_BUDGET_MS = 45_000

// How many invoices to process per cron invocation.
// Each extraction = 2 Xero API calls (listAttachments + fetchAttachment).
// At 2/run every 15 min = 8/hour = 16 Xero calls/hour = 384/day,
// well under Xero's 1000/day rate limit with headroom for UI usage.
const MAX_PER_RUN = 2

// When cache is stale (older than this), refresh it from Xero.
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function GET(req: Request) {
  return handleCron(req)
}

export async function POST(req: Request) {
  return handleCron(req)
}

async function handleCron(req: Request) {
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

    const supabase = adminClient()

    // Check cache age
    const { data: cacheStats } = await supabase
      .from('xero_bill_cache')
      .select('last_synced_at')
      .order('last_synced_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const cacheAge = cacheStats?.last_synced_at
      ? Date.now() - new Date(cacheStats.last_synced_at).getTime()
      : Infinity

    // Refresh cache if missing or stale
    if (cacheAge > CACHE_TTL_MS) {
      try {
        await refreshCache(supabase)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        // If we're rate limited during cache refresh, skip and try next time
        if (msg.includes('429')) {
          return NextResponse.json({
            skipped: 'rate_limited',
            message: msg,
            elapsed: `${((Date.now() - start) / 1000).toFixed(1)}s`,
          })
        }
        throw e
      }
    }

    // Find candidates from CACHE (zero Xero calls)
    // First get the set of already-processed invoice IDs
    const { data: runs } = await supabase
      .from('extraction_runs')
      .select('xero_invoice_id, status')

    const doneSet = new Set(
      (runs ?? [])
        .filter((r) => r.status === 'completed' || r.status === 'processing')
        .map((r) => r.xero_invoice_id)
    )

    // Get candidates from cache — fetch a bigger pool and filter in JS
    // (Supabase .not('col', 'in', subquery) doesn't support subqueries)
    const { data: cached } = await supabase
      .from('xero_bill_cache')
      .select('xero_invoice_id, contact_name, invoice_number, invoice_date')
      .eq('has_attachments', true)
      .limit(500)

    const candidates = (cached ?? [])
      .filter((c) => !doneSet.has(c.xero_invoice_id))
      .slice(0, MAX_PER_RUN)

    if (candidates.length === 0) {
      return NextResponse.json({ processed: 0, message: 'All done' })
    }

    let processed = 0
    let failed = 0
    let rateLimited = false

    for (const c of candidates) {
      if (Date.now() - start > TIME_BUDGET_MS) break
      if (rateLimited) break

      const { data: run } = await supabase
        .from('extraction_runs')
        .upsert(
          {
            xero_invoice_id: c.xero_invoice_id,
            attachment_name: '_pending',
            supplier_name: c.contact_name,
            invoice_number: c.invoice_number,
            invoice_date: c.invoice_date,
            status: 'processing',
            created_at: new Date().toISOString(),
          },
          { onConflict: 'xero_invoice_id,attachment_name' }
        )
        .select('id')
        .single()

      if (!run) { failed++; continue }

      try {
        const result = await extractLinesFromInvoice(c.xero_invoice_id)

        await supabase
          .from('extraction_runs')
          .update({
            attachment_name: result.attachmentName,
            status: 'completed',
            model_used: result.model,
            raw_response: result.rawResponse,
            completed_at: new Date().toISOString(),
          })
          .eq('id', run.id)

        if (result.items.length > 0) {
          await supabase.from('extracted_line_items').delete().eq('run_id', run.id)
          await supabase.from('extracted_line_items').insert(
            result.items.map((item) => ({
              run_id: run.id,
              xero_invoice_id: c.xero_invoice_id,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unit_price: item.unit_price,
              total: item.total,
              category: item.category,
            }))
          )
        }
        processed++
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        await supabase
          .from('extraction_runs')
          .update({ status: 'failed', error_message: msg })
          .eq('id', run.id)
        failed++

        // If we get rate limited, stop immediately
        if (msg.includes('429')) {
          rateLimited = true
        }
      }
    }

    return NextResponse.json({
      processed,
      failed,
      rateLimited,
      cacheAgeHours: cacheAge === Infinity ? null : Math.round(cacheAge / 3600000),
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

async function refreshCache(supabase: ReturnType<typeof adminClient>) {
  // Fetch up to 5 pages (500 bills). Each page = 1 Xero API call.
  const allBills: Awaited<ReturnType<typeof listBills>> = []

  for (let page = 1; page <= 5; page++) {
    const bills = await listBills({ page })
    if (bills.length === 0) break
    allBills.push(...bills)
    if (bills.length < 100) break // Last page
  }

  if (allBills.length === 0) return

  const now = new Date().toISOString()

  // Upsert all into cache. We store every field the Bills UI needs so it
  // can render without hitting Xero on page load.
  await supabase.from('xero_bill_cache').upsert(
    allBills.map((b) => ({
      xero_invoice_id: b.invoiceID,
      contact_name: b.contactName,
      invoice_number: b.invoiceNumber,
      invoice_date: b.date,
      has_attachments: b.hasAttachments,
      total: b.total,
      amount_due: b.amountDue,
      amount_paid: b.amountPaid,
      currency_code: b.currencyCode,
      status: b.status,
      due_date: b.dueDate,
      reference: b.reference,
      last_synced_at: now,
    }))
  )
}
