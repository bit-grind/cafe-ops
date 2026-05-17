import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'

// ── Unit conversion tables ────────────────────────────────────────────────

// Recipe units → mL (for volume ingredients)
const RECIPE_UNIT_ML: Record<string, number> = {
  ml: 1, mL: 1,
  l: 1000, L: 1000, lt: 1000, ltr: 1000, litre: 1000, liter: 1000,
  cup: 250,
  tbsp: 15, tablespoon: 15,
  tsp: 5, teaspoon: 5,
}

// Recipe units → g (for weight ingredients)
const RECIPE_UNIT_G: Record<string, number> = {
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
}

// Invoice units that are already a known volume/weight unit
const INVOICE_UNIT_ML: Record<string, number> = {
  ml: 1, l: 1000, lt: 1000, ltr: 1000, litre: 1000, liter: 1000,
}
const INVOICE_UNIT_G: Record<string, number> = {
  g: 1, kg: 1000,
}

/**
 * Try to extract total pack size from a description string.
 * Handles patterns like "12 X 1L", "2LTR", "500ML", "25KG", "12x330ml (MSL)".
 * Returns the largest matching measurement to prefer pack size over serving size.
 */
function parsePackSize(desc: string): { type: 'mL'; amount: number } | { type: 'g'; amount: number } | null {
  const d = desc.toUpperCase()

  // "N X M UNIT" — multi-pack, e.g. "12 X 1L", "12X330ML", "10 x 450ml"
  const multiRe = /(\d+(?:\.\d+)?)\s*[X×]\s*(\d+(?:\.\d+)?)\s*(ML|L\b|LT\b|LTR\b|KG\b|G\b)/g
  let m: RegExpExecArray | null
  let best: ReturnType<typeof parsePackSize> = null

  while ((m = multiRe.exec(d)) !== null) {
    const count = parseFloat(m[1])
    const size = parseFloat(m[2])
    const unit = m[3].trim()
    let candidate: typeof best = null
    if (unit === 'ML') candidate = { type: 'mL', amount: count * size }
    else if (unit === 'L' || unit === 'LT' || unit === 'LTR') candidate = { type: 'mL', amount: count * size * 1000 }
    else if (unit === 'G') candidate = { type: 'g', amount: count * size }
    else if (unit === 'KG') candidate = { type: 'g', amount: count * size * 1000 }
    if (candidate) best = pickLarger(best, candidate)
  }
  if (best) return best

  // Single "N UNIT" — e.g. "2LTR", "500ML", "25KG", "500G"
  const singleRe = /(\d+(?:\.\d+)?)\s*(ML|L\b|LT\b|LTR\b|KG\b|G\b)/g
  while ((m = singleRe.exec(d)) !== null) {
    const size = parseFloat(m[1])
    const unit = m[2].trim()
    let candidate: typeof best = null
    if (unit === 'ML') candidate = { type: 'mL', amount: size }
    else if (unit === 'L' || unit === 'LT' || unit === 'LTR') candidate = { type: 'mL', amount: size * 1000 }
    else if (unit === 'G') candidate = { type: 'g', amount: size }
    else if (unit === 'KG') candidate = { type: 'g', amount: size * 1000 }
    if (candidate) best = pickLarger(best, candidate)
  }
  return best
}

function pickLarger(
  a: { type: 'mL'; amount: number } | { type: 'g'; amount: number } | null,
  b: { type: 'mL'; amount: number } | { type: 'g'; amount: number },
) {
  if (!a) return b
  if (a.type !== b.type) return a
  return (a.amount >= b.amount ? a : b)
}

/**
 * Convert invoice unit_price → price per recipe unit.
 * Returns null if conversion is not possible.
 * Also returns a human-readable breakdown string.
 */
function convertPrice(
  invoicePrice: number,
  invoiceUnit: string | null,
  description: string,
  recipeUnit: string | null,
): { price: number; from: string } | null {
  if (!recipeUnit) return null

  const ru = recipeUnit.toLowerCase()
  const iu = (invoiceUnit ?? '').toLowerCase()

  // ── Volume conversion ──
  const recipeML = RECIPE_UNIT_ML[ru]
  if (recipeML !== undefined) {
    let pricePerML: number | null = null
    let fromStr = ''

    // Invoice unit is already a volume unit (e.g. L, mL)
    const invML = INVOICE_UNIT_ML[iu]
    if (invML !== undefined) {
      pricePerML = invoicePrice / invML
      fromStr = `$${invoicePrice}/${invoiceUnit}`
    }

    // Invoice unit is a container — parse pack size from description
    if (pricePerML === null) {
      const pack = parsePackSize(description)
      if (pack?.type === 'mL') {
        pricePerML = invoicePrice / pack.amount
        fromStr = `$${invoicePrice}/${invoiceUnit ?? 'unit'} (${pack.amount >= 1000 ? pack.amount / 1000 + 'L' : pack.amount + 'mL'})`
      }
    }

    if (pricePerML !== null) {
      return { price: parseFloat((pricePerML * recipeML).toFixed(6)), from: fromStr }
    }
    return null
  }

  // ── Weight conversion ──
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
        fromStr = `$${invoicePrice}/${invoiceUnit ?? 'unit'} (${pack.amount >= 1000 ? pack.amount / 1000 + 'kg' : pack.amount + 'g'})`
      }
    }

    if (pricePerG !== null) {
      return { price: parseFloat((pricePerG * recipeG).toFixed(6)), from: fromStr }
    }
    return null
  }

  return null
}

// ── Stop words for keyword extraction ─────────────────────────────────────

const STOP_WORDS = new Set([
  'and', 'or', 'the', 'a', 'an', 'with', 'fresh', 'frozen', 'finely',
  'chopped', 'diced', 'sliced', 'whole', 'dried', 'ground', 'packed',
  'softened', 'melted', 'room', 'temperature', 'large', 'small', 'medium',
  'plain', 'free', 'full', 'cream', 'for', 'per', 'raw', 'mixed',
])

function keywords(name: string): string[] {
  return [...new Set(
    name.toLowerCase()
      .replace(/[&'']/g, '')
      .replace(/\d+/g, '')
      .split(/[\s\-\/]+/)
      .map(w => w.trim())
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  )].sort((a, b) => b.length - a.length).slice(0, 2)
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const db = adminClient()

  const { data: ingredients } = await db
    .from('recipe_ingredients')
    .select('id, ingredient, qty_unit')
    .eq('recipe_id', id)

  if (!ingredients?.length) return NextResponse.json({ suggestions: {} })

  const suggestions: Record<number, object[]> = {}

  await Promise.all(
    ingredients.map(async ing => {
      const kws = keywords(ing.ingredient)
      if (!kws.length) { suggestions[ing.id] = []; return }

      // Step 1: find matching line items
      const { data: rows } = await db
        .from('extracted_line_items')
        .select('id, description, unit_price, unit, xero_invoice_id, created_at')
        .gt('unit_price', 0)
        .ilike('description', `%${kws[0]}%`)
        .order('created_at', { ascending: false })
        .limit(30)

      if (!rows?.length) { suggestions[ing.id] = []; return }

      // Secondary keyword filter
      const pool = kws[1]
        ? rows.filter(r => r.description.toLowerCase().includes(kws[1]))
        : rows
      const filtered = pool.length ? pool : rows

      // De-duplicate by description+unit_price
      const seen = new Set<string>()
      const deduped = filtered.filter(r => {
        const key = `${r.description.toLowerCase()}|${r.unit_price}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }).slice(0, 5)

      // Step 2: supplier info
      const invoiceIds = [...new Set(deduped.map(r => r.xero_invoice_id).filter(Boolean))]
      const supplierMap: Record<string, { contact_name: string | null; invoice_date: string | null }> = {}
      if (invoiceIds.length) {
        const { data: bills } = await db
          .from('xero_bill_cache')
          .select('xero_invoice_id, contact_name, invoice_date')
          .in('xero_invoice_id', invoiceIds)
        for (const bill of bills ?? []) {
          supplierMap[bill.xero_invoice_id] = { contact_name: bill.contact_name, invoice_date: bill.invoice_date }
        }
      }

      suggestions[ing.id] = deduped.map(r => {
        const raw = Number(r.unit_price)
        const conversion = convertPrice(raw, r.unit, r.description, ing.qty_unit)
        return {
          id: r.id,
          description: r.description,
          unit_price: raw,
          unit: r.unit,
          supplier: supplierMap[r.xero_invoice_id]?.contact_name ?? null,
          invoice_date: supplierMap[r.xero_invoice_id]?.invoice_date ?? null,
          // Converted price and metadata
          converted_price: conversion?.price ?? null,
          converted_from: conversion?.from ?? null,
          recipe_unit: ing.qty_unit,
        }
      })
    })
  )

  return NextResponse.json({ suggestions })
}
