const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function finiteNumber(value: unknown, field: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a finite number`)
  return parsed
}

function isoDate(value: unknown, field = 'business_date'): string {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) throw new Error(`${field} must be YYYY-MM-DD`)
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a valid calendar date`)
  }
  return value
}

export type DailySalesRow = {
  business_date: string
  gross_sales: number
  net_sales: number
  tax: number
  discounts: number
  refunds: number
  order_count: number
  aov: number
}

export type ProductSalesRow = {
  business_date: string
  position: number
  product: string
  quantity: number
  quantity_pct: number
  sale_amount: number
  sale_pct: number
  cost: number
  gross_profit_pct: number
}

export function parseDailySalesRows(input: unknown): DailySalesRow[] {
  if (!Array.isArray(input)) throw new Error('Body must be an array')
  if (input.length > 400) throw new Error('Too many daily rows')
  const seen = new Set<string>()
  return input.map((row, index) => {
    if (!row || typeof row !== 'object') throw new Error(`Row ${index} must be an object`)
    const value = row as Record<string, unknown>
    const business_date = isoDate(value.business_date)
    if (seen.has(business_date)) throw new Error(`Duplicate business_date: ${business_date}`)
    seen.add(business_date)
    return {
      business_date,
      gross_sales: finiteNumber(value.gross_sales, 'gross_sales'),
      net_sales: finiteNumber(value.net_sales, 'net_sales'),
      tax: finiteNumber(value.tax, 'tax'),
      discounts: finiteNumber(value.discounts, 'discounts'),
      refunds: finiteNumber(value.refunds, 'refunds'),
      order_count: finiteNumber(value.order_count, 'order_count'),
      aov: finiteNumber(value.aov, 'aov'),
    }
  })
}

export function parseProductImport(input: unknown): {
  businessDate: string
  rows: ProductSalesRow[]
  allowEmpty: boolean
} {
  if (!input || typeof input !== 'object') throw new Error('Body must be an object')
  const body = input as Record<string, unknown>
  const businessDate = isoDate(body.business_date)
  if (!Array.isArray(body.rows)) throw new Error('rows must be an array')
  if (body.rows.length > 2500) throw new Error('Too many product rows')
  if (body.rows.length === 0 && body.allow_empty !== true) {
    throw new Error('Empty product imports require allow_empty=true')
  }

  const seen = new Set<string>()
  const rows = body.rows.map((row, index) => {
    if (!row || typeof row !== 'object') throw new Error(`Row ${index} must be an object`)
    const value = row as Record<string, unknown>
    if (isoDate(value.business_date) !== businessDate) throw new Error('All product rows must match business_date')
    const product = typeof value.product === 'string' ? value.product.trim() : ''
    if (!product || product.length > 200) throw new Error('product must be 1-200 characters')
    const key = product.toLowerCase()
    if (seen.has(key)) throw new Error(`Duplicate product: ${product}`)
    seen.add(key)
    return {
      business_date: businessDate,
      position: finiteNumber(value.position, 'position'),
      product,
      quantity: finiteNumber(value.quantity, 'quantity'),
      quantity_pct: finiteNumber(value.quantity_pct, 'quantity_pct'),
      sale_amount: finiteNumber(value.sale_amount, 'sale_amount'),
      sale_pct: finiteNumber(value.sale_pct, 'sale_pct'),
      cost: finiteNumber(value.cost, 'cost'),
      gross_profit_pct: finiteNumber(value.gross_profit_pct, 'gross_profit_pct'),
    }
  })
  return { businessDate, rows, allowEmpty: body.allow_empty === true }
}
