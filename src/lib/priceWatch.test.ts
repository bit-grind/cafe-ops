import { describe, it, expect } from 'vitest'
import { computePriceChanges, type PriceLineRow } from '@/lib/priceWatch'

const row = (description: string, unit_price: number, supplier: string, invoice_date: string): PriceLineRow =>
  ({ description, unit: 'ea', unit_price, supplier, invoice_date })

describe('computePriceChanges', () => {
  it('flags a significant increase between the two latest invoices', () => {
    const out = computePriceChanges([
      row('Full Cream Milk 2L', 2.0, 'Southside', '2026-03-01'),
      row('Full Cream Milk 2L', 2.4, 'Southside', '2026-04-01'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].pct_change).toBe(20)
    expect(out[0].old_price).toBe(2)
    expect(out[0].new_price).toBe(2.4)
    expect(out[0].new_date).toBe('2026-04-01')
  })

  it('ignores sub-threshold percentage moves', () => {
    const out = computePriceChanges([
      row('Sugar 1kg', 2.0, 'X', '2026-03-01'),
      row('Sugar 1kg', 2.05, 'X', '2026-04-01'), // +2.5%
    ])
    expect(out).toHaveLength(0)
  })

  it('ignores cent-level noise even when the percentage is large', () => {
    const out = computePriceChanges([
      row('Straw', 0.02, 'X', '2026-03-01'),
      row('Straw', 0.05, 'X', '2026-04-01'), // +150% but only 3c
    ])
    expect(out).toHaveLength(0)
  })

  it('does not merge the same product across different suppliers', () => {
    const out = computePriceChanges([
      row('Milk', 2.0, 'Supplier A', '2026-03-01'),
      row('Milk', 4.0, 'Supplier B', '2026-04-01'),
    ])
    expect(out).toHaveLength(0)
  })

  it('compares the two most recent invoices when several exist', () => {
    const out = computePriceChanges([
      row('Coffee Beans 1kg', 30, 'Roaster', '2026-01-01'),
      row('Coffee Beans 1kg', 33, 'Roaster', '2026-02-01'),
      row('Coffee Beans 1kg', 36, 'Roaster', '2026-03-01'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].old_price).toBe(33)
    expect(out[0].new_price).toBe(36)
    expect(out[0].pct_change).toBe(9.1)
  })

  it('sorts the largest moves first', () => {
    const out = computePriceChanges([
      row('A', 10, 'S', '2026-01-01'), row('A', 11, 'S', '2026-02-01'), // +10%
      row('B', 10, 'S', '2026-01-01'), row('B', 14, 'S', '2026-02-01'), // +40%
    ])
    expect(out.map(c => c.description)).toEqual(['B', 'A'])
  })
})
