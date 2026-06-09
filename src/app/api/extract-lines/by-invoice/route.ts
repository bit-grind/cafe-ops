import { NextResponse } from 'next/server'
import { adminClient, getSessionUser } from '@/lib/adminAuth'
import { internalError } from '@/lib/apiError'

/**
 * GET /api/extract-lines/by-invoice?invoiceId=<xero-invoice-id>
 *
 * Returns the extracted line items for a single invoice plus the
 * extraction status, so the UI can distinguish "not yet processed"
 * from "processed, zero items".
 */
export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const invoiceId = url.searchParams.get('invoiceId')?.trim()
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
  }

  const supabase = adminClient()

  // Run both queries in parallel. Line items carry xero_invoice_id directly,
  // so we don't need to wait for the run lookup before fetching them — the
  // run query is only used for status-string and error-message metadata.
  const [runRes, itemsRes] = await Promise.all([
    supabase
      .from('extraction_runs')
      .select('status, error_message, completed_at, model_used')
      .eq('xero_invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('extracted_line_items')
      .select('id, description, quantity, unit, unit_price, total, category')
      .eq('xero_invoice_id', invoiceId)
      .order('id', { ascending: true }),
  ])

  if (itemsRes.error) {
    return internalError('Line-item lookup failed', itemsRes.error, 'Failed to load line items')
  }

  const run = runRes.data

  if (!run) {
    return NextResponse.json({ status: null, items: [] })
  }

  return NextResponse.json({
    status: run.status,
    errorMessage: run.error_message,
    completedAt: run.completed_at,
    model: run.model_used,
    items: itemsRes.data ?? [],
  })
}
