import { NextResponse } from 'next/server'
import { requireAdmin, adminClient } from '@/lib/adminAuth'
import { extractLinesFromInvoice } from '@/lib/extractLines'
import { getBill } from '@/lib/xero'

/**
 * POST /api/extract-lines
 *
 * Extract line items from a single invoice attachment using AI.
 * Admin only. Idempotent — skips invoices already processed.
 *
 * Body: { invoiceId: string, attachmentName?: string }
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    invoiceId?: string
    attachmentName?: string
  }
  const invoiceId = body.invoiceId?.trim()
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
  }

  const supabase = adminClient()

  // Check if already processed
  if (body.attachmentName) {
    const { data: existing } = await supabase
      .from('extraction_runs')
      .select('id, status')
      .eq('xero_invoice_id', invoiceId)
      .eq('attachment_name', body.attachmentName)
      .maybeSingle()

    if (existing?.status === 'completed') {
      return NextResponse.json({ skipped: true, message: 'Already extracted' })
    }
  }

  // Fetch bill metadata from Xero for context
  const bill = await getBill(invoiceId)

  // Create or update extraction_runs row
  const { data: run, error: runErr } = await supabase
    .from('extraction_runs')
    .upsert(
      {
        xero_invoice_id: invoiceId,
        attachment_name: body.attachmentName ?? '_pending',
        supplier_name: bill?.contactName ?? null,
        invoice_number: bill?.invoiceNumber ?? null,
        invoice_date: bill?.date ?? null,
        status: 'processing',
        created_at: new Date().toISOString(),
      },
      { onConflict: 'xero_invoice_id,attachment_name' }
    )
    .select('id')
    .single()

  if (runErr) {
    return NextResponse.json({ error: runErr.message }, { status: 500 })
  }

  try {
    const result = await extractLinesFromInvoice(invoiceId, body.attachmentName)

    // Update the attachment_name if it was resolved from the API
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

    // Insert extracted line items
    if (result.items.length > 0) {
      // Delete any old items for this run (in case of retry)
      await supabase.from('extracted_line_items').delete().eq('run_id', run.id)

      const rows = result.items.map((item) => ({
        run_id: run.id,
        xero_invoice_id: invoiceId,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total: item.total,
        category: item.category,
      }))
      const { error: insertErr } = await supabase.from('extracted_line_items').insert(rows)
      if (insertErr) throw new Error(insertErr.message)
    }

    return NextResponse.json({
      success: true,
      runId: run.id,
      itemCount: result.items.length,
      items: result.items,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    await supabase
      .from('extraction_runs')
      .update({ status: 'failed', error_message: msg })
      .eq('id', run.id)

    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
