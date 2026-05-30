import { describe, expect, it } from 'vitest'
import { parseDailySalesRows, parseProductImport } from '@/lib/importValidation'

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
