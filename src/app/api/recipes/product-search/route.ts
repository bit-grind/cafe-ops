import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'
import { internalError } from '@/lib/apiError'
import { convertRecipePrice } from '@/lib/recipeUnits'

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

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  const recipeUnit = url.searchParams.get('recipeUnit')?.trim() || null
  const ingredient = url.searchParams.get('ingredient')?.trim() || q
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const { data, error } = await adminClient()
    .from('extracted_line_items')
    .select(`
      id,
      description,
      unit,
      unit_price,
      xero_invoice_id,
      extraction_runs!inner (
        supplier_name,
        invoice_number,
        invoice_date
      )
    `)
    .gt('unit_price', 0)
    .ilike('description', `%${q}%`)
    .order('invoice_date', { ascending: false, foreignTable: 'extraction_runs' })
    .limit(40)

  if (error) return internalError('Product search failed', error, 'Search failed')

  const seen = new Set<string>()
  const results = (data ?? [])
    .filter((row: Record<string, unknown>) => {
      const key = `${String(row.description).toLowerCase()}|${row.unit_price}|${row.unit}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 12)
    .map((row: Record<string, unknown>) => {
      const run = pickExtractionRun(row.extraction_runs as ExtractionRunRelation)
      const raw = Number(row.unit_price)
      const description = String(row.description ?? '')
      const unit = row.unit ? String(row.unit) : null
      const conv = convertRecipePrice({
        invoicePrice: raw,
        invoiceUnit: unit,
        description,
        recipeUnit,
        ingredient,
      })

      return {
        id: row.id,
        description,
        unit_price: raw,
        unit,
        supplier: run?.supplier_name ?? null,
        invoice_date: run?.invoice_date ?? null,
        converted_price: conv?.price ?? null,
        converted_from: conv?.from ?? null,
        recipe_unit: recipeUnit,
        approximate: conv ? !conv.exact : false,
        can_apply: conv?.canApply ?? false,
      }
    })
    .sort((a, b) => Number(b.can_apply) - Number(a.can_apply) || Number(a.approximate) - Number(b.approximate))

  return NextResponse.json({ results })
}
