import { describe, expect, it } from 'vitest'
import { mapHours, parseHourCell, parseKountaDateCell } from './hourMapping.mjs'

// The shape Kounta actually serves: row of hour labels, then one row per day.
// Reproduced from a live export (2026-07-28): 25 columns, day cell "28 Jul 2026",
// quiet hours as bare "0", trading hours with cents.
const HOUR_LABELS = ['', ...Array.from({ length: 24 }, (_, h) => {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
})]

const pivotRows = [
  HOUR_LABELS,
  ['28 Jul 2026', ...Array.from({ length: 24 }, (_, h) => {
    if (h === 6) return '327.65'
    if (h === 7) return '624.93'
    if (h === 8) return '870.33'
    return '0'
  })],
]

describe('mapHours — pivot shape (what Kounta serves today)', () => {
  const hours = mapHours(pivotRows, '2026-07-28')

  it('maps every hour of the day for the requested date', () => {
    expect(hours).toHaveLength(24)
    expect(hours.map(h => h.hour)).toEqual(Array.from({ length: 24 }, (_, h) => h))
    expect(hours.every(h => h.business_date === '2026-07-28')).toBe(true)
  })

  it('reads the real gross figure into the right hour', () => {
    expect(hours.find(h => h.hour === 6).gross_sales).toBe(327.65)
    expect(hours.find(h => h.hour === 7).gross_sales).toBe(624.93)
    expect(hours.find(h => h.hour === 8).gross_sales).toBe(870.33)
    expect(hours.find(h => h.hour === 3).gross_sales).toBe(0)
  })

  // The point of this change: the export carries one measure, so everything
  // else must read as "not available", never as a real zero.
  it('reports unavailable metrics as null, not zero', () => {
    for (const hour of hours) {
      expect(hour.order_count).toBeNull()
      expect(hour.aov).toBeNull()
      expect(hour.tax).toBeNull()
      expect(hour.net_sales).toBeNull()
    }
  })

  it('returns nothing when the requested day is absent', () => {
    expect(mapHours(pivotRows, '2026-07-27')).toEqual([])
  })
})

describe('mapHours — long shape (if Kounta ever serves named columns)', () => {
  it('populates real counts when the export labels them', () => {
    const rows = [
      ['Sale Hour', 'Sale Count', 'Sale Amount', 'Sale Ex Amount', 'Sale Tax Amount', 'Average Amount'],
      ['8am', '12', '120.00', '109.09', '10.91', '10.00'],
      ['9am', '5', '50.00', '45.45', '4.55', '10.00'],
    ]
    expect(mapHours(rows, '2026-07-28')).toEqual([
      { business_date: '2026-07-28', hour: 8, gross_sales: 120, net_sales: 109.09, tax: 10.91, order_count: 12, aov: 10 },
      { business_date: '2026-07-28', hour: 9, gross_sales: 50, net_sales: 45.45, tax: 4.55, order_count: 5, aov: 10 },
    ])
  })

  it('leaves unlabelled metrics null rather than guessing a column', () => {
    const rows = [
      ['Sale Hour', 'Sale Amount'],
      ['8am', '120.00'],
    ]
    const [hour] = mapHours(rows, '2026-07-28')
    expect(hour.gross_sales).toBe(120)
    expect(hour.order_count).toBeNull()
    expect(hour.aov).toBeNull()
    expect(hour.tax).toBeNull()
    expect(hour.net_sales).toBeNull()
  })

  it('derives aov only when a real count is present', () => {
    const rows = [
      ['Sale Hour', 'Sale Count', 'Sale Amount'],
      ['8am', '4', '120.00'],
      ['9am', '0', '0'],
    ]
    const [eight, nine] = mapHours(rows, '2026-07-28')
    expect(eight.aov).toBe(30)
    expect(nine.aov).toBeNull()
  })
})

describe('cell parsers', () => {
  it('reads Kounta hour labels', () => {
    expect(parseHourCell('12am')).toBe(0)
    expect(parseHourCell('8am')).toBe(8)
    expect(parseHourCell('12pm')).toBe(12)
    expect(parseHourCell('5pm')).toBe(17)
    expect(parseHourCell('8am - 9am')).toBe(8)
    expect(parseHourCell('Total')).toBeNull()
    expect(parseHourCell('')).toBeNull()
  })

  it('reads both Kounta date spellings', () => {
    expect(parseKountaDateCell('2026-07-28')).toBe('2026-07-28')
    expect(parseKountaDateCell('28 Jul 2026')).toBe('2026-07-28')
    expect(parseKountaDateCell('1 September 2026')).toBe('2026-09-01')
    expect(parseKountaDateCell('not a date')).toBeNull()
  })
})
