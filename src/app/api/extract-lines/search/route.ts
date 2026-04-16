import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/adminAuth'

/**
 * GET /api/extract-lines/search?q=keyword
 *
 * Search extracted invoice line items by description.
 * Available to any authenticated user.
 */
export async function GET(req: Request) {
  // Auth check — any authenticated user
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
  const q = url.searchParams.get('q')?.trim()
  if (!q) {
    return NextResponse.json({ error: 'q parameter is required' }, { status: 400 })
  }

  const supabase = adminClient()

  // Search using ILIKE with trigram index for fuzzy matching
  const pattern = `%${q}%`
  const { data, error } = await supabase
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
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten the join for a cleaner response
  const results = (data ?? []).map((row: Record<string, unknown>) => {
    const run = row.extraction_runs as Record<string, unknown> | null
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
