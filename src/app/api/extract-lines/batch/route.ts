import { NextResponse } from 'next/server'
import { requireAdmin, adminClient } from '@/lib/adminAuth'
import { listAllBills, listBillAttachments } from '@/lib/xero'

/**
 * GET /api/extract-lines/batch
 *
 * Returns the list of invoices that have attachments but haven't been
 * processed yet. The admin UI iterates through these one at a time,
 * calling POST /api/extract-lines for each.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const supabase = adminClient()

  // Get all bills with attachments from Xero
  const allBills = await listAllBills({}, { maxPages: 5 })
  const withAttachments = allBills.filter((b) => b.hasAttachments)

  // Get already-processed invoice IDs from Supabase
  const { data: runs } = await supabase
    .from('extraction_runs')
    .select('xero_invoice_id, status')

  const processed = new Set(
    (runs ?? [])
      .filter((r) => r.status === 'completed')
      .map((r) => r.xero_invoice_id)
  )
  const failed = new Set(
    (runs ?? [])
      .filter((r) => r.status === 'failed')
      .map((r) => r.xero_invoice_id)
  )

  const pending = withAttachments
    .filter((b) => !processed.has(b.invoiceID))
    .map((b) => ({
      invoiceId: b.invoiceID,
      supplier: b.contactName,
      invoiceNumber: b.invoiceNumber,
      date: b.date,
      total: b.total,
      failed: failed.has(b.invoiceID),
    }))

  return NextResponse.json({
    total: withAttachments.length,
    processed: processed.size,
    pending: pending.length,
    bills: pending,
  })
}
