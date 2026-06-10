import { describe, expect, it } from 'vitest'
import {
  computeDashboardMetrics,
  sparklinePoints,
  splitBriefInsights,
  type DashboardDay,
} from '@/lib/v2Dashboard'

function day(businessDate: string, grossSales: number, orderCount = 10): DashboardDay {
  return {
    business_date: businessDate,
    gross_sales: grossSales,
    net_sales: grossSales,
    tax: 0,
    discounts: 0,
    refunds: 0,
    order_count: orderCount,
    aov: grossSales / orderCount,
  }
}

describe('computeDashboardMetrics', () => {
  it('uses UTC-anchored Monday to Sunday boundaries', () => {
    const metrics = computeDashboardMetrics([
      day('2026-06-10', 300),
      day('2026-06-09', 200),
      day('2026-06-08', 100),
      day('2026-06-07', 700),
      day('2026-06-03', 150),
      day('2026-06-02', 100),
      day('2026-06-01', 50),
    ], '2026-06-10')

    expect(metrics).toMatchObject({
      wtdFrom: '2026-06-08',
      weekTo: '2026-06-14',
      wtdSales: 600,
      lastWeekFrom: '2026-06-01',
      lastWeekTo: '2026-06-07',
      lastWeekSales: 1000,
    })
    expect(metrics?.wowPct).toBe(100)
  })

  it('compares the live day with prior matching weekdays', () => {
    const metrics = computeDashboardMetrics([
      day('2026-06-10', 360),
      day('2026-06-03', 300),
      day('2026-05-27', 300),
    ], '2026-06-10')

    expect(metrics?.liveVsTypicalPct).toBe(20)
  })

  it('computes month totals without host-local date parsing', () => {
    const metrics = computeDashboardMetrics([
      day('2026-06-10', 400),
      day('2026-06-01', 200),
      day('2026-05-31', 300),
      day('2026-05-01', 200),
    ], '2026-06-10')

    expect(metrics).toMatchObject({
      mtdFrom: '2026-06-01',
      mtdSales: 600,
      lastMonthFrom: '2026-05-01',
      lastMonthTo: '2026-05-31',
      lastMonthSales: 500,
      momPct: 20,
    })
  })
})

describe('splitBriefInsights', () => {
  it('returns concise sentences and respects the limit', () => {
    expect(splitBriefInsights('Sales are up.\nMorning was strongest!\nWatch lunch?\nExtra detail.', 3))
      .toEqual(['Sales are up.', 'Morning was strongest!', 'Watch lunch?'])
  })
})

describe('sparklinePoints', () => {
  it('returns bounded points for a series', () => {
    expect(sparklinePoints([10, 20, 15], 100, 40)).toBe('0.0,36.0 50.0,4.0 100.0,20.0')
  })
})
