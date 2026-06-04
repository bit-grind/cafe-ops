import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeMetrics, getLatestBrief } from '@/lib/brief'

type Day = { business_date: string; gross_sales: number; net_sales: number; order_count: number; aov: number }
const day = (business_date: string, gross_sales: number): Day =>
  ({ business_date, gross_sales, net_sales: gross_sales * 0.9, order_count: 100, aov: gross_sales / 100 })

type QueryCall = [string, ...unknown[]]
type QueryResult = { data: unknown; error?: { message: string } | null }

class MockQuery {
  constructor(private calls: QueryCall[], private results: QueryResult[]) {}

  select(...args: unknown[]) {
    this.calls.push(['select', ...args])
    return this
  }

  order(...args: unknown[]) {
    this.calls.push(['order', ...args])
    return this
  }

  limit(...args: unknown[]) {
    this.calls.push(['limit', ...args])
    return this
  }

  eq(...args: unknown[]) {
    this.calls.push(['eq', ...args])
    return this
  }

  lte(...args: unknown[]) {
    this.calls.push(['lte', ...args])
    return this
  }

  async maybeSingle() {
    this.calls.push(['maybeSingle'])
    return this.results.shift() ?? { data: null, error: null }
  }
}

function mockSupabase(results: QueryResult[]) {
  const calls: QueryCall[][] = []
  const client = {
    from(table: string) {
      const queryCalls: QueryCall[] = [['from', table]]
      calls.push(queryCalls)
      return new MockQuery(queryCalls, results)
    },
  } as unknown as SupabaseClient

  return { client, calls }
}

describe('computeMetrics', () => {
  it('judges the subject day against recent same-weekday averages', () => {
    const days: Day[] = [
      day('2026-04-08', 4000), // Wednesday (subject)
      day('2026-04-07', 3500), // Tuesday
      day('2026-04-06', 3500), // Monday
      day('2026-04-01', 3000), // Wednesday
      day('2026-03-25', 3000), // Wednesday
    ]
    const m = computeMetrics(days, [])
    expect(m.subject_date).toBe('2026-04-08')
    expect(m.day_of_week).toBe('Wednesday')
    expect(m.is_weekend).toBe(false)
    expect(m.gross_sales).toBe(4000)
    expect(m.same_weekday_avg_gross).toBe(3000)
    expect(m.vs_same_weekday_avg_pct).toBe(33.3)
    expect(m.prev_same_weekday?.date).toBe('2026-04-01')
  })

  it('flags weekends and ranks top products by quantity', () => {
    const m = computeMetrics([day('2026-04-11', 8000)], [ // Saturday
      { product: 'Flat White', quantity: 120, sale_amount: 600 },
      { product: 'Big Breakfast', quantity: 40, sale_amount: 760 },
    ])
    expect(m.is_weekend).toBe(true)
    expect(m.day_of_week).toBe('Saturday')
    expect(m.top_products[0].product).toBe('Flat White')
  })
})

describe('getLatestBrief', () => {
  it('returns the newest completed brief on or before the latest sales day', async () => {
    const brief = {
      brief_date: '2026-06-02',
      generated_at: '2026-06-03T20:00:00.000Z',
      metrics: {},
      narrative: 'Previous completed brief',
      model: null,
      generation_status: 'completed',
    }
    const { client, calls } = mockSupabase([
      { data: { business_date: '2026-06-03' }, error: null },
      { data: brief, error: null },
    ])

    await expect(getLatestBrief(client)).resolves.toEqual(brief)
    expect(calls[1]).toContainEqual(['lte', 'brief_date', '2026-06-03'])
    expect(calls[1]).toContainEqual(['eq', 'generation_status', 'completed'])
    expect(calls[1]).toContainEqual(['order', 'brief_date', { ascending: false }])
    expect(calls[1]).toContainEqual(['limit', 1])
  })
})
