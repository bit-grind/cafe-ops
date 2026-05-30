import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Supplier price-watch: detects when the unit price we pay for an ingredient has
 * moved meaningfully between its two most recent supplier invoices. Built on the
 * AI-extracted line items (real prices off the supplier PDFs).
 *
 * The detection (`computePriceChanges`) is a pure function so it can be unit
 * tested without a database. Grouping is conservative — exact (supplier +
 * description) match — so we never falsely merge two different products.
 */

export type PriceLineRow = {
  description: string
  unit: string | null
  unit_price: number | null
  supplier: string | null
  invoice_date: string | null
}

export type PriceChange = {
  description: string
  supplier: string | null
  unit: string | null
  old_price: number
  new_price: number
  pct_change: number
  old_date: string
  new_date: string
}

export type PriceWatchOptions = {
  /** Minimum absolute % change to report (default 8). */
  minPct?: number
  /** Minimum absolute $ change to report, to filter out cent-level noise (default 0.05). */
  minAbs?: number
  /** Max number of changes to return (default 20). */
  limit?: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Given raw priced line items, return the most significant recent price changes
 * (latest invoice vs the prior one for the same supplier+product), largest move
 * first.
 */
export function computePriceChanges(rows: PriceLineRow[], opts: PriceWatchOptions = {}): PriceChange[] {
  const minPct = opts.minPct ?? 8
  const minAbs = opts.minAbs ?? 0.05
  const limit = opts.limit ?? 20

  type Group = {
    description: string
    supplier: string | null
    unit: string | null
    byDate: Map<string, { sum: number; n: number }>
  }
  const groups = new Map<string, Group>()

  for (const r of rows) {
    if (r.unit_price == null || !r.invoice_date) continue
    const price = Number(r.unit_price)
    if (!Number.isFinite(price) || price <= 0) continue
    const desc = (r.description ?? '').trim()
    if (!desc) continue

    const key = `${(r.supplier ?? '').toLowerCase().trim()}|${desc.toLowerCase()}`
    let g = groups.get(key)
    if (!g) {
      g = { description: desc, supplier: r.supplier ?? null, unit: r.unit ?? null, byDate: new Map() }
      groups.set(key, g)
    }
    const slot = g.byDate.get(r.invoice_date) ?? { sum: 0, n: 0 }
    slot.sum += price
    slot.n += 1
    g.byDate.set(r.invoice_date, slot)
  }

  const changes: PriceChange[] = []
  for (const g of groups.values()) {
    // One average price per invoice date, oldest → newest.
    const points = [...g.byDate.entries()]
      .map(([date, { sum, n }]) => ({ date, price: sum / n }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    if (points.length < 2) continue

    const prev = points[points.length - 2]
    const curr = points[points.length - 1]
    const delta = curr.price - prev.price
    if (Math.abs(delta) < minAbs) continue
    const pct = prev.price > 0 ? (delta / prev.price) * 100 : 0
    if (Math.abs(pct) < minPct) continue

    changes.push({
      description: g.description,
      supplier: g.supplier,
      unit: g.unit,
      old_price: round2(prev.price),
      new_price: round2(curr.price),
      pct_change: round1(pct),
      old_date: prev.date,
      new_date: curr.date,
    })
  }

  changes.sort((a, b) => Math.abs(b.pct_change) - Math.abs(a.pct_change))
  return changes.slice(0, limit)
}

type ExtractionRunRelation = { supplier_name: string | null; invoice_date: string | null }
function pickRun(run: ExtractionRunRelation | ExtractionRunRelation[] | null): ExtractionRunRelation | null {
  if (!run) return null
  return Array.isArray(run) ? (run[0] ?? null) : run
}

/** Fetch recent priced line items and return the significant price changes. */
export async function getPriceWatch(supabase: SupabaseClient, opts: PriceWatchOptions = {}): Promise<PriceChange[]> {
  const { data, error } = await supabase
    .from('extracted_line_items')
    .select('description, unit, unit_price, extraction_runs!inner(supplier_name, invoice_date)')
    .not('unit_price', 'is', null)
    .order('id', { ascending: false })
    .limit(5000)
  if (error) {
    console.error('price-watch fetch failed:', error.message)
    return []
  }

  const rows: PriceLineRow[] = (data ?? []).map(r => {
    const run = pickRun(r.extraction_runs as ExtractionRunRelation | ExtractionRunRelation[] | null)
    return {
      description: r.description as string,
      unit: (r.unit as string | null) ?? null,
      unit_price: (r.unit_price as number | null) ?? null,
      supplier: run?.supplier_name ?? null,
      invoice_date: run?.invoice_date ?? null,
    }
  })
  return computePriceChanges(rows, opts)
}
