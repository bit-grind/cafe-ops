import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/adminAuth'

/**
 * GET /api/extract-lines/by-invoice?invoiceId=<xero-invoice-id>
 *
 * Returns the extracted line items for a single invoice plus the
 * extraction status, so the UI can distinguish "not yet processed"
 * from "processed, zero items".
 */
export async function GET(req: Request) {
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const invoiceId = url.searchParams.get('invoiceId')?.trim()
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
  }

  const supabase = adminClient()

  // Most recent run for this invoice
  const { data: run } = await supabase
    .from('extraction_runs')
    .select('id, status, error_message, completed_at, created_at, model_used')
    .eq('xero_invoice_id', invoiceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!run) {
    return NextResponse.json({ status: null, items: [] })
  }

  const { data: items, error } = await supabase
    .from('extracted_line_items')
    .select('id, description, quantity, unit, unit_price, total, category')
    .eq('run_id', run.id)
    .order('id', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    status: run.status,
    errorMessage: run.error_message,
    completedAt: run.completed_at,
    model: run.model_used,
    items: items ?? [],
  })
}
