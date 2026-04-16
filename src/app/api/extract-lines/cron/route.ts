import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { extractLinesFromInvoice } from '@/lib/extractLines'
import { listBills } from '@/lib/xero'

// Allow up to 60s on Hobby plan
export const maxDuration = 60

// Time budget: stop starting new extractions after 45s to leave
// headroom for the current one to finish within 60s.
const TIME_BUDGET_MS = 45_000

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

    // Get all processed/in-progress invoice IDs from DB (fast, single query)
    const { data: runs } = await supabase
      .from('extraction_runs')
      .select('xero_invoice_id, status')

    const doneSet = new Set(
      (runs ?? [])
        .filter((r) => r.status === 'completed' || r.status === 'processing')
        .map((r) => r.xero_invoice_id)
    )

    // Find pending invoices by paging through Xero (1 API call per page)
    let candidates: Array<{
      invoiceID: string; contactName: string;
      invoiceNumber: string | null; date: string
    }> = []

    for (let page = 1; page <= 5; page++) {
      if (Date.now() - start > TIME_BUDGET_MS) break
      const bills = await listBills({ page })
      if (bills.length === 0) break
      const unprocessed = bills.filter((b) => b.hasAttachments && !doneSet.has(b.invoiceID))
      candidates.push(...unprocessed)
      // Once we have enough candidates, stop paging
      if (candidates.length >= 5) break
      // If this page had some unprocessed, no need to keep paging
      if (unprocessed.length > 0) break
    }

    if (candidates.length === 0) {
      return NextResponse.json({ processed: 0, failed: 0, remaining: 0, message: 'All done' })
    }

    let processed = 0
    let failed = 0

    for (const bill of candidates) {
      // Check time budget before starting a new extraction
      if (Date.now() - start > TIME_BUDGET_MS) break

      const { data: run, error: runErr } = await supabase
        .from('extraction_runs')
        .upsert(
          {
            xero_invoice_id: bill.invoiceID,
            attachment_name: '_pending',
            supplier_name: bill.contactName ?? null,
            invoice_number: bill.invoiceNumber ?? null,
            invoice_date: bill.date ?? null,
            status: 'processing',
            created_at: new Date().toISOString(),
          },
          { onConflict: 'xero_invoice_id,attachment_name' }
        )
        .select('id')
        .single()

      if (runErr || !run) { failed++; continue }

      try {
        const result = await extractLinesFromInvoice(bill.invoiceID)

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
          const rows = result.items.map((item) => ({
            run_id: run.id,
            xero_invoice_id: bill.invoiceID,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            total: item.total,
            category: item.category,
          }))
          await supabase.from('extracted_line_items').insert(rows)
        }
        processed++
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        await supabase
          .from('extraction_runs')
          .update({ status: 'failed', error_message: msg })
          .eq('id', run.id)
        failed++
      }
    }

    return NextResponse.json({
      processed,
      failed,
      elapsed: `${((Date.now() - start) / 1000).toFixed(1)}s`,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg, elapsed: `${((Date.now() - start) / 1000).toFixed(1)}s` }, { status: 500 })
  }
}
