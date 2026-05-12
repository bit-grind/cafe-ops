import { NextResponse } from 'next/server'
import { requireAdmin, adminClient } from '@/lib/adminAuth'
import { listAllBills } from '@/lib/xero'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * GET /api/extract-lines/batch
 *
 * Returns extraction status. By default returns just database counts
 * (fast). Add ?full=1 to also fetch pending bills from Xero (slow,
 * needed for manual batch processing from the admin UI).
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const full = url.searchParams.get('full') === '1'

  const supabase = adminClient()

  // Counts via HEAD requests with `count: 'exact'`. We cannot select rows
  // and tally them client-side — PostgREST silently caps every query at
  // 1,000 rows, so once extraction_runs exceeds 1k the tally drifts (and
  // can even drop as the cron updates rows and shuffles the heap order).
  const [completedRes, failedRes, processingRes, itemCountRes] = await Promise.all([
    supabase
      .from('extraction_runs')
      .select('xero_invoice_id', { count: 'exact', head: true })
      .eq('status', 'completed'),
    supabase
      .from('extraction_runs')
      .select('xero_invoice_id', { count: 'exact', head: true })
      .eq('status', 'failed'),
    supabase
      .from('extraction_runs')
      .select('xero_invoice_id', { count: 'exact', head: true })
      .eq('status', 'processing'),
    supabase
      .from('extracted_line_items')
      .select('id', { count: 'exact', head: true }),
  ])

  const completed = completedRes.count ?? 0
  const failed = failedRes.count ?? 0
  const processing = processingRes.count ?? 0
  const itemCount = itemCountRes.count ?? 0

  if (!full) {
    // Fast mode: just return DB counts, no Xero calls
    return NextResponse.json({
      completed,
      failed,
      processing,
      itemCount,
    })
  }

  // Full mode: fetch bills from Xero to find pending ones. We need the
  // actual invoice IDs (not just counts) so we have to drain the table.
  // Same PostgREST 1k cap applies — paginate with .range().
  const [processedSet, failedSet] = await Promise.all([
    fetchInvoiceIdsByStatus(supabase, 'completed'),
    fetchInvoiceIdsByStatus(supabase, 'failed'),
  ])

  const allBills = await listAllBills({}, { maxPages: 5 })
  const withAttachments = allBills.filter((b) => b.hasAttachments)

  const pending = withAttachments
    .filter((b) => !processedSet.has(b.invoiceID))
    .map((b) => ({
      invoiceId: b.invoiceID,
      supplier: b.contactName,
      invoiceNumber: b.invoiceNumber,
      date: b.date,
      total: b.total,
      failed: failedSet.has(b.invoiceID),
    }))

  return NextResponse.json({
    total: withAttachments.length,
    completed,
    failed,
    processing,
    pending: pending.length,
    itemCount,
    bills: pending,
  })
}

/**
 * Drain every xero_invoice_id from extraction_runs at the given status.
 * PostgREST caps each request at 1,000 rows server-side regardless of
 * .limit(), so we paginate explicitly with .range() like the cron does.
 */
async function fetchInvoiceIdsByStatus(
  supabase: SupabaseClient,
  status: 'completed' | 'failed' | 'processing'
): Promise<Set<string>> {
  const ids = new Set<string>()
  const PAGE = 1000
  for (let from = 0; from < 200_000; from += PAGE) {
    const { data, error } = await supabase
      .from('extraction_runs')
      .select('xero_invoice_id')
      .eq('status', status)
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const r of data) ids.add(r.xero_invoice_id)
    if (data.length < PAGE) break
  }
  return ids
}
