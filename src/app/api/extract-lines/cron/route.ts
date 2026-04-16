import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { extractLinesFromInvoice } from '@/lib/extractLines'
import { listBills } from '@/lib/xero'

// Allow up to 60s on Hobby plan (default is 10s)
export const maxDuration = 60

/**
 * GET & POST /api/extract-lines/cron
 *
 * Processes ONE invoice per call to stay well within the 60s timeout.
 * pg_cron fires this every 2 minutes — steady progress, no timeouts.
 *
 * Strategy: fetch a single page of bills from Xero (fast), check which
 * ones we haven't processed yet, extract the first unprocessed one.
 */
export async function GET(req: Request) {
  return handleCron(req)
}

export async function POST(req: Request) {
  return handleCron(req)
}

async function handleCron(req: Request) {
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

    // Get all processed invoice IDs from DB (fast)
    const { data: runs } = await supabase
      .from('extraction_runs')
      .select('xero_invoice_id, status')

    const doneSet = new Set(
      (runs ?? [])
        .filter((r) => r.status === 'completed' || r.status === 'processing')
        .map((r) => r.xero_invoice_id)
    )

    // Fetch ONE page of bills from Xero (max 100, single API call)
    const bills = await listBills({ page: 1 })
    const candidates = bills.filter((b) => b.hasAttachments && !doneSet.has(b.invoiceID))

    if (candidates.length === 0) {
      // Try page 2
      const bills2 = await listBills({ page: 2 })
      const candidates2 = bills2.filter((b) => b.hasAttachments && !doneSet.has(b.invoiceID))
      if (candidates2.length === 0) {
        // Try pages 3-5
        for (let p = 3; p <= 5; p++) {
          const billsN = await listBills({ page: p })
          if (billsN.length === 0) break
          const found = billsN.filter((b) => b.hasAttachments && !doneSet.has(b.invoiceID))
          if (found.length > 0) {
            return await processOne(supabase, found[0])
          }
        }
        return NextResponse.json({ processed: 0, remaining: 0, message: 'All done' })
      }
      return await processOne(supabase, candidates2[0])
    }

    return await processOne(supabase, candidates[0])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function processOne(
  supabase: ReturnType<typeof adminClient>,
  bill: { invoiceID: string; contactName: string; invoiceNumber: string | null; date: string }
) {
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

  if (runErr || !run) {
    return NextResponse.json({ error: runErr?.message ?? 'Failed to create run' }, { status: 500 })
  }

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

    return NextResponse.json({
      processed: 1,
      invoice: bill.invoiceNumber,
      supplier: bill.contactName,
      items: result.items.length,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    await supabase
      .from('extraction_runs')
      .update({ status: 'failed', error_message: msg })
      .eq('id', run.id)
    return NextResponse.json({ error: msg, invoice: bill.invoiceNumber }, { status: 500 })
  }
}
