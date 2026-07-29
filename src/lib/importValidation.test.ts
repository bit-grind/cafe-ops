import { describe, expect, it } from 'vitest'
import { parseDailySalesRows, parseHourlyImport, parseProductImport } from '@/lib/importValidation'

const dailyRow = {
  business_date: '2026-05-29',
  gross_sales: 100,
  net_sales: 90,
  tax: 10,
  discounts: 0,
  refunds: 0,
  order_count: 5,
  aov: 20,
}

const productRow = {
  business_date: '2026-05-29',
  position: 1,
  product: 'Flat White',
  quantity: 4,
  quantity_pct: 20,
  sale_amount: 24,
  sale_pct: 24,
  cost: 6,
  gross_profit_pct: 75,
}

const hourlyRow = {
  business_date: '2026-05-29',
  hour: 8,
  gross_sales: 120,
  net_sales: 109.09,
  tax: 10.91,
  order_count: 12,
  aov: 10,
}

describe('parseDailySalesRows', () => {
  it('accepts a valid daily sales payload', () => {
    expect(parseDailySalesRows([dailyRow])).toEqual([dailyRow])
  })

  it('rejects duplicate dates and impossible calendar dates', () => {
    expect(() => parseDailySalesRows([dailyRow, dailyRow])).toThrow('Duplicate business_date')
    expect(() => parseDailySalesRows([{ ...dailyRow, business_date: '2026-02-31' }])).toThrow('valid calendar date')
  })
})

describe('parseProductImport', () => {
  it('requires an explicit opt-in before replacing a day with no product rows', () => {
    expect(() => parseProductImport({ business_date: '2026-05-29', rows: [] })).toThrow('allow_empty=true')
    expect(parseProductImport({ business_date: '2026-05-29', rows: [], allow_empty: true })).toEqual({
      businessDate: '2026-05-29',
      rows: [],
      allowEmpty: true,
    })
  })

  it('rejects duplicate products and rows for a different day', () => {
    expect(() => parseProductImport({ business_date: '2026-05-29', rows: [productRow, productRow] })).toThrow('Duplicate product')
    expect(() => parseProductImport({
      business_date: '2026-05-29',
      rows: [{ ...productRow, business_date: '2026-05-28' }],
    })).toThrow('must match business_date')
  })
})

describe('parseHourlyImport', () => {
  it('accepts valid hourly buckets for one business day', () => {
    expect(parseHourlyImport({ business_date: '2026-05-29', rows: [hourlyRow] })).toEqual({
      businessDate: '2026-05-29',
      rows: [hourlyRow],
      allowEmpty: false,
    })
  })

  it('rejects duplicate hours and rows for a different day', () => {
    expect(() => parseHourlyImport({ business_date: '2026-05-29', rows: [hourlyRow, hourlyRow] })).toThrow('Duplicate hour')
    expect(() => parseHourlyImport({
      business_date: '2026-05-29',
      rows: [{ ...hourlyRow, business_date: '2026-05-28' }],
    })).toThrow('must match business_date')
  })

  // Kounta's by-hour export only carries Sale Amount, so the sync sends null for
  // the rest. Null must survive: coerced to 0 it reads as a real zero.
  it('preserves nulls for metrics the source cannot provide', () => {
    const unavailable = {
      business_date: '2026-05-29',
      hour: 8,
      gross_sales: 120,
      net_sales: null,
      tax: null,
      order_count: null,
      aov: null,
    }
    expect(parseHourlyImport({ business_date: '2026-05-29', rows: [unavailable] }).rows).toEqual([unavailable])
  })

  it('treats an omitted optional metric as null rather than zero', () => {
    const [row] = parseHourlyImport({
      business_date: '2026-05-29',
      rows: [{ business_date: '2026-05-29', hour: 8, gross_sales: 120 }],
    }).rows
    expect(row.order_count).toBeNull()
    expect(row.aov).toBeNull()
    expect(row.net_sales).toBeNull()
    expect(row.tax).toBeNull()
  })

  it('still rejects a non-numeric value and a missing gross_sales', () => {
    expect(() => parseHourlyImport({
      business_date: '2026-05-29',
      rows: [{ ...hourlyRow, order_count: 'twelve' }],
    })).toThrow('order_count must be a finite number')
    expect(() => parseHourlyImport({
      business_date: '2026-05-29',
      rows: [{ ...hourlyRow, gross_sales: null }],
    })).toThrow('gross_sales must be a finite number')
  })
})
