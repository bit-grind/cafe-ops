import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'

const RECIPE_UNIT_ML: Record<string, number> = {
  ml: 1, mL: 1, l: 1000, L: 1000, lt: 1000, ltr: 1000, litre: 1000, liter: 1000,
  cup: 250, tbsp: 15, tablespoon: 15, tsp: 5, teaspoon: 5,
}
const RECIPE_UNIT_G: Record<string, number> = {
  g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000,
}
const INVOICE_UNIT_ML: Record<string, number> = {
  ml: 1, l: 1000, lt: 1000, ltr: 1000, litre: 1000, liter: 1000,
}
const INVOICE_UNIT_G: Record<string, number> = { g: 1, kg: 1000 }

type PackSize = { type: 'mL'; amount: number } | { type: 'g'; amount: number }

function parsePackSize(desc: string): PackSize | null {
  const d = desc.toUpperCase()
  let best: PackSize | null = null

  // "N X M UNIT" — multi-pack, e.g. "12 X 1L", "6X500ML", "24X330ML"
  const multiRe = /(\d+(?:\.\d+)?)\s*[X×]\s*(\d+(?:\.\d+)?)\s*(ML|L\b|LT\b|LTR\b|KG\b|G\b)/g
  let m: RegExpExecArray | null
  while ((m = multiRe.exec(d)) !== null) {
    const count = parseFloat(m[1]), size = parseFloat(m[2]), unit = m[3].trim()
    const c = toPackSize(count * size, unit)
    if (c) best = pickLarger(best, c)
  }
  if (best) return best

  // Single "N UNIT" — e.g. "2LT", "20LT", "2.5KG", "500ML"
  // Note: "(N)" patterns like "2.5KG(6)" — the (6) means 6/case, NOT a multiplier
  // We take the FIRST weight/volume measurement as the individual unit size
  const singleRe = /(\d+(?:\.\d+)?)\s*(ML|L\b|LT\b|LTR\b|KG\b|G\b)/g
  while ((m = singleRe.exec(d)) !== null) {
    const c = toPackSize(parseFloat(m[1]), m[2].trim())
    if (c) { best = pickLarger(best, c) }
  }
  return best
}

function toPackSize(amount: number, unit: string): PackSize | null {
  if (unit === 'ML') return { type: 'mL', amount }
  if (unit === 'L' || unit === 'LT' || unit === 'LTR') return { type: 'mL', amount: amount * 1000 }
  if (unit === 'G') return { type: 'g', amount }
  if (unit === 'KG') return { type: 'g', amount: amount * 1000 }
  return null
}

function pickLarger(a: PackSize | null, b: PackSize): PackSize {
  if (!a || a.type !== b.type) return a ?? b
  return (a.type === 'mL' ? (a as {type:'mL';amount:number}).amount : (a as {type:'g';amount:number}).amount) >=
         (b.type === 'mL' ? b.amount : b.amount) ? a : b
}

type ConvertResult = {
  price: number
  unit: string        // unit the price applies to (recipe unit, or 'kg'/'L' for normalized)
  from: string        // human-readable source e.g. "$22.55/btl (2.5kg)"
  exact: boolean      // true = price is per recipe unit; false = normalized, needs manual conversion
}

function convertPrice(
  invoicePrice: number,
  invoiceUnit: string | null,
  description: string,
  recipeUnit: string | null,
): ConvertResult | null {
  if (!recipeUnit) {
    // No recipe unit — still try to normalize to $/kg or $/L from pack size
    const pack = parsePackSize(description)
    if (!pack) return null
    const label = `$${invoicePrice}/${invoiceUnit ?? 'unit'} (${packLabel(pack)})`
    if (pack.type === 'mL') return { price: round(invoicePrice / pack.amount * 1000), unit: 'L', from: label, exact: false }
    return { price: round(invoicePrice / pack.amount * 1000), unit: 'kg', from: label, exact: false }
  }

  const ru = recipeUnit.toLowerCase()
  const iu = (invoiceUnit ?? '').toLowerCase()

  // ── Volume → volume ────────────────────────────────────────────────────
  const recipeML = RECIPE_UNIT_ML[ru]
  if (recipeML !== undefined) {
    let pricePerML: number | null = null
    let fromStr = ''

    const invML = INVOICE_UNIT_ML[iu]
    if (invML !== undefined) {
      pricePerML = invoicePrice / invML
      fromStr = `$${invoicePrice}/${invoiceUnit}`
    }
    if (pricePerML === null) {
      const pack = parsePackSize(description)
      if (pack?.type === 'mL') {
        pricePerML = invoicePrice / pack.amount
        fromStr = `$${invoicePrice}/${invoiceUnit ?? 'unit'} (${packLabel(pack)})`
      } else if (pack?.type === 'g') {
        // Weight pack, volume recipe — show normalized $/L as fallback
        const label = `$${invoicePrice}/${invoiceUnit ?? 'unit'} (${packLabel(pack)})`
        return { price: round(invoicePrice / pack.amount * 1000), unit: 'kg', from: label, exact: false }
      }
    }
    if (pricePerML !== null) {
      return { price: round6(pricePerML * recipeML), unit: recipeUnit, from: fromStr, exact: true }
    }
    return null
  }

  // ── Weight → weight ────────────────────────────────────────────────────
  const recipeG = RECIPE_UNIT_G[ru]
  if (recipeG !== undefined) {
    let pricePerG: number | null = null
    let fromStr = ''

    const invG = INVOICE_UNIT_G[iu]
    if (invG !== undefined) {
      pricePerG = invoicePrice / invG
      fromStr = `$${invoicePrice}/${invoiceUnit}`
    }
    if (pricePerG === null) {
      const pack = parsePackSize(description)
      if (pack?.type === 'g') {
        pricePerG = invoicePrice / pack.amount
        fromStr = `$${invoicePrice}/${invoiceUnit ?? 'unit'} (${packLabel(pack)})`
      } else if (pack?.type === 'mL') {
        // Volume pack, weight recipe — normalized $/L fallback
        const label = `$${invoicePrice}/${invoiceUnit ?? 'unit'} (${packLabel(pack)})`
        return { price: round(invoicePrice / pack.amount * 1000), unit: 'L', from: label, exact: false }
      }
    }
    if (pricePerG !== null) {
      return { price: round6(pricePerG * recipeG), unit: recipeUnit, from: fromStr, exact: true }
    }
    return null
  }

  return null
}

function packLabel(pack: PackSize): string {
  if (pack.type === 'mL') return pack.amount >= 1000 ? `${pack.amount / 1000}L` : `${pack.amount}mL`
  return pack.amount >= 1000 ? `${pack.amount / 1000}kg` : `${pack.amount}g`
}
function round(n: number) { return parseFloat(n.toFixed(4)) }
function round6(n: number) { return parseFloat(n.toFixed(6)) }

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
      const conv = convertPrice(raw, r.unit, r.description, ing.qty_unit)
      return {
        id: r.id,
        description: r.description,
        unit_price: raw,
        unit: r.unit,
        supplier: supplierMap[r.xero_invoice_id]?.contact_name ?? null,
        invoice_date: supplierMap[r.xero_invoice_id]?.invoice_date ?? null,
        converted_price: conv?.exact ? conv.price : null,
        converted_from: conv?.from ?? null,
        recipe_unit: ing.qty_unit,
        // Normalized fallback: best price info even when exact conversion isn't possible
        normalized_price: conv && !conv.exact ? conv.price : null,
        normalized_unit: conv && !conv.exact ? conv.unit : null,
      }
    })
  }))

  return NextResponse.json({ suggestions })
}
