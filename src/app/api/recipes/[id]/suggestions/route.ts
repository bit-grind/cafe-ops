import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'
import { convertRecipePrice } from '@/lib/recipeUnits'

// ── Stop words ─────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'and', 'or', 'the', 'a', 'an', 'with', 'fresh', 'frozen', 'finely',
  'chopped', 'diced', 'sliced', 'whole', 'dried', 'ground', 'packed',
  'softened', 'melted', 'room', 'temperature', 'large', 'small', 'medium',
  'plain', 'free', 'full', 'cream', 'for', 'per', 'raw', 'mixed',
])

function keywords(name: string): string[] {
  return [...new Set(
    name.toLowerCase().replace(/[&'']/g, '').replace(/\d+/g, '')
      .split(/[\s\-\/]+/).map(w => w.trim()).filter(w => w.length > 2 && !STOP_WORDS.has(w))
  )].sort((a, b) => b.length - a.length).slice(0, 2)
}

// ── Route ──────────────────────────────────────────────────────────────────

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const db = adminClient()

  const { data: ingredients } = await db
    .from('recipe_ingredients').select('id, ingredient, qty_unit').eq('recipe_id', id)

  if (!ingredients?.length) return NextResponse.json({ suggestions: {} })

  const suggestions: Record<number, object[]> = {}

  await Promise.all(ingredients.map(async ing => {
    const kws = keywords(ing.ingredient)
    if (!kws.length) { suggestions[ing.id] = []; return }

    const { data: rows } = await db
      .from('extracted_line_items')
      .select('id, description, unit_price, unit, xero_invoice_id, created_at')
      .gt('unit_price', 0).ilike('description', `%${kws[0]}%`)
      .order('created_at', { ascending: false }).limit(30)

    if (!rows?.length) { suggestions[ing.id] = []; return }

    const pool = kws[1] ? rows.filter(r => r.description.toLowerCase().includes(kws[1])) : rows
    const filtered = pool.length ? pool : rows

    const seen = new Set<string>()
    const deduped = filtered.filter(r => {
      const key = `${r.description.toLowerCase()}|${r.unit_price}`
      if (seen.has(key)) return false; seen.add(key); return true
    }).slice(0, 5)

    const invoiceIds = [...new Set(deduped.map(r => r.xero_invoice_id).filter(Boolean))]
    const supplierMap: Record<string, { contact_name: string | null; invoice_date: string | null }> = {}
    if (invoiceIds.length) {
      const { data: bills } = await db.from('xero_bill_cache')
        .select('xero_invoice_id, contact_name, invoice_date').in('xero_invoice_id', invoiceIds)
      for (const b of bills ?? []) supplierMap[b.xero_invoice_id] = { contact_name: b.contact_name, invoice_date: b.invoice_date }
    }

    suggestions[ing.id] = deduped.map(r => {
      const raw = Number(r.unit_price)
      const conv = convertRecipePrice({
        invoicePrice: raw,
        invoiceUnit: r.unit,
        description: r.description,
        recipeUnit: ing.qty_unit,
        ingredient: ing.ingredient,
      })
      return {
        id: r.id,
        description: r.description,
        unit_price: raw,
        unit: r.unit,
        supplier: supplierMap[r.xero_invoice_id]?.contact_name ?? null,
        invoice_date: supplierMap[r.xero_invoice_id]?.invoice_date ?? null,
        converted_price: conv?.price ?? null,
        converted_from: conv?.from ?? null,
        recipe_unit: ing.qty_unit,
        approximate: conv ? !conv.exact : false,
        can_apply: conv?.canApply ?? false,
      }
    }).sort((a, b) => Number(b.can_apply) - Number(a.can_apply) || Number(a.approximate) - Number(b.approximate))
  }))

  return NextResponse.json({ suggestions })
}
