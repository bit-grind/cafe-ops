import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { extractLinesFromInvoice } from '@/lib/extractLines'
import { listAllBills, getBill } from '@/lib/xero'

const BATCH_SIZE = 10

/**
 * POST /api/extract-lines/cron
 *
 * Automated batch extraction endpoint. Processes up to BATCH_SIZE
 * invoices per call. Protected by CRON_SECRET env var.
 *
 * Returns: { processed, failed, remaining }
 */
export async function POST(req: Request) {
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

  // Get all bills with attachments
  const allBills = await listAllBills({}, { maxPages: 5 })
  const withAttachments = allBills.filter((b) => b.hasAttachments)

  // Get already-processed invoice IDs
  const { data: runs } = await supabase
    .from('extraction_runs')
    .select('xero_invoice_id, status')

  const done = new Set(
    (runs ?? [])
      .filter((r) => r.status === 'completed')
      .map((r) => r.xero_invoice_id)
  )

  const pending = withAttachments.filter((b) => !done.has(b.invoiceID))

  if (pending.length === 0) {
    return NextResponse.json({ processed: 0, failed: 0, remaining: 0, message: 'All invoices extracted' })
  }

  const batch = pending.slice(0, BATCH_SIZE)
  let processed = 0
  let failed = 0

  for (const bill of batch) {
    // Create/update run row
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

    // Respect Xero rate limits
    await new Promise((r) => setTimeout(r, 2000))
  }

  return NextResponse.json({
    processed,
    failed,
    remaining: pending.length - batch.length,
  })
}
