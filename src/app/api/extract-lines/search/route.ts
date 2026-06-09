import { NextResponse } from 'next/server'
import { adminClient, getSessionUser } from '@/lib/adminAuth'
import { internalError } from '@/lib/apiError'

type ExtractionRunRelation =
  | {
      supplier_name: string | null
      invoice_number: string | null
      invoice_date: string | null
    }
  | Array<{
      supplier_name: string | null
      invoice_number: string | null
      invoice_date: string | null
    }>
  | null

function pickExtractionRun(run: ExtractionRunRelation) {
  if (!run) return null
  return Array.isArray(run) ? (run[0] ?? null) : run
}

/**
 * GET /api/extract-lines/search?q=keyword
 *
 * Search extracted invoice line items by description.
 * Available to any authenticated user.
 */
export async function GET(req: Request) {
  // Auth check — any authenticated user
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  if (!q || q.length > 100) {
    return NextResponse.json({ error: 'q parameter is required' }, { status: 400 })
  }
  const dateFrom = url.searchParams.get('dateFrom')?.trim() || null
  const dateTo = url.searchParams.get('dateTo')?.trim() || null

  const supabase = adminClient()

  // Search using ILIKE with trigram index for fuzzy matching
  const pattern = `%${q}%`
  let query = supabase
    .from('extracted_line_items')
    .select(`
      id,
      description,
      quantity,
      unit,
      unit_price,
      total,
      category,
      xero_invoice_id,
      extraction_runs!inner (
        supplier_name,
        invoice_number,
        invoice_date
      )
    `)
    .ilike('description', pattern)

  if (dateFrom) query = query.gte('extraction_runs.invoice_date', dateFrom)
  if (dateTo) query = query.lte('extraction_runs.invoice_date', dateTo)

  const { data, error } = await query
    .order('invoice_date', { ascending: false, foreignTable: 'extraction_runs' })
    .limit(500)

  if (error) {
    return internalError('Line-item search failed', error, 'Search failed')
  }

  // Flatten the join for a cleaner response
  const results = (data ?? []).map((row: Record<string, unknown>) => {
    const run = pickExtractionRun(row.extraction_runs as ExtractionRunRelation)
    return {
      id: row.id,
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
      unit_price: row.unit_price,
      total: row.total,
      category: row.category,
      supplier: run?.supplier_name ?? null,
      invoiceNumber: run?.invoice_number ?? null,
      invoiceDate: run?.invoice_date ?? null,
      invoiceId: row.xero_invoice_id,
    }
  })

  return NextResponse.json({ results, count: results.length })
}
