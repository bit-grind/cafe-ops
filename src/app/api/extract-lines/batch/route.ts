import { NextResponse } from 'next/server'
import { requireAdmin, adminClient } from '@/lib/adminAuth'
import { listAllBills } from '@/lib/xero'

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

  // Always: get counts from the database (fast)
  const { data: runs } = await supabase
    .from('extraction_runs')
    .select('xero_invoice_id, status')

  const completed = (runs ?? []).filter((r) => r.status === 'completed').length
  const failed = (runs ?? []).filter((r) => r.status === 'failed').length
  const processing = (runs ?? []).filter((r) => r.status === 'processing').length

  const { count: itemCount } = await supabase
    .from('extracted_line_items')
    .select('id', { count: 'exact', head: true })

  if (!full) {
    // Fast mode: just return DB counts, no Xero calls
    return NextResponse.json({
      completed,
      failed,
      processing,
      itemCount: itemCount ?? 0,
    })
  }

  // Full mode: fetch bills from Xero to find pending ones
  const allBills = await listAllBills({}, { maxPages: 5 })
  const withAttachments = allBills.filter((b) => b.hasAttachments)

  const processedSet = new Set(
    (runs ?? [])
      .filter((r) => r.status === 'completed')
      .map((r) => r.xero_invoice_id)
  )
  const failedSet = new Set(
    (runs ?? [])
      .filter((r) => r.status === 'failed')
      .map((r) => r.xero_invoice_id)
  )

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
    itemCount: itemCount ?? 0,
    bills: pending,
  })
}
