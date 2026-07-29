/**
 * Maps Kounta's `salesummarybyhour` export into hourly buckets.
 *
 * ## Only ONE measure is available, and it is Sale Amount
 *
 * The report page has a measure selector — `select[name=cboSalesBy]` with
 * options `btnAmount` (Sale Amount), `btnCount` (Sale Count) and `btnAverage`
 * (Average Sale) — but the CSV export cannot be moved off Sale Amount. Probed
 * against the live report on 2026-07-29:
 *
 *   - no sibling by-hour report slug exists (`salesbyhour`, `salecountbyhour`,
 *     `hourlysales`, `transactionsbyhour`, … all 404; only `salesummarybyhour`
 *     returns 200)
 *   - the export ignores the measure as a query param under every plausible
 *     spelling (`SalesBy`, `cboSalesBy`, `SalesByID`, `SaleBy`, `Measure`,
 *     `ReportBy`, `ValueType` × `btnCount`/`Count`) — byte-identical output
 *   - POSTing the form fields to the export endpoint returns 400
 *   - the selector's handler is `selectOnChangeSalesBy`, which is just
 *     `$("#"+value).trigger("click")` — it re-renders a Highcharts chart in the
 *     browser and fires NO server request, so nothing is remembered server-side;
 *     exporting straight after switching still yields Sale Amount
 *
 * So per-hour order count, tax, net sales and AOV are genuinely NOT AVAILABLE
 * from this source. They are emitted as `null` — never 0, which is a real value
 * a caller would reasonably plot or divide by. Day-level counts are unaffected:
 * `salesummary` has a true `salecount` column (see mapSummary in sync.mjs).
 *
 * If Kounta ever starts serving the long/tabular shape (one row per hour with
 * named columns), `mapLongHours` picks up whatever real figures it carries.
 */

export const num = (s) => {
  const n = parseFloat(String(s ?? '').replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export const normalizeHeader = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function parseHourCell(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text || text === 'total') return null
  const first = text.split(/\s[-–—]\s/)[0]?.trim() || text
  const time = first.match(/(\d{1,2})(?::\d{2})?\s*(am|pm)?/)
  if (time) {
    let hour = Number(time[1])
    const meridiem = time[2]
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
    return hour >= 0 && hour <= 23 ? hour : null
  }
  const bare = Number.parseInt(text, 10)
  return Number.isInteger(bare) && bare >= 0 && bare <= 23 ? bare : null
}

export function parseKountaDateCell(value) {
  const text = String(value ?? '').trim()
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return text
  const named = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/)
  if (!named) return null
  const months = new Map([
    ['jan', '01'], ['january', '01'],
    ['feb', '02'], ['february', '02'],
    ['mar', '03'], ['march', '03'],
    ['apr', '04'], ['april', '04'],
    ['may', '05'],
    ['jun', '06'], ['june', '06'],
    ['jul', '07'], ['july', '07'],
    ['aug', '08'], ['august', '08'],
    ['sep', '09'], ['sept', '09'], ['september', '09'],
    ['oct', '10'], ['october', '10'],
    ['nov', '11'], ['november', '11'],
    ['dec', '12'], ['december', '12'],
  ])
  const month = months.get(named[2].toLowerCase())
  if (!month) return null
  return `${named[3]}-${month}-${named[1].padStart(2, '0')}`
}

/**
 * The shape Kounta actually serves: a pivot with a row of hour labels and one
 * row per day. Each cell is a Sale Amount, so every other metric is unknown.
 */
function mapPivotHours(rows, businessDate) {
  const headerIndex = rows.findIndex(row => {
    const hours = row.slice(1).map(parseHourCell).filter(hour => hour != null)
    return hours.length >= 12
  })
  if (headerIndex < 0) return []

  const header = rows[headerIndex]
  const dayRow = rows.slice(headerIndex + 1).find(row => parseKountaDateCell(row[0]) === businessDate)
  if (!dayRow) return []

  return header
    .map((cell, index) => ({ hour: parseHourCell(cell), value: dayRow[index] }))
    .filter(({ hour }) => hour != null)
    .map(({ hour, value }) => ({
      business_date: businessDate,
      hour,
      gross_sales: num(value),
      // Not available in this export — see the module header. null, not 0.
      net_sales: null,
      tax: null,
      order_count: null,
      aov: null,
    }))
    .sort((a, b) => a.hour - b.hour)
}

/** One row per hour with named columns. Not currently served, but harmless to support. */
function mapLongHours(rows, businessDate) {
  const headerIndex = rows.findIndex(row => {
    const normalized = row.map(normalizeHeader)
    const hasHour = normalized.some(h => ['salehour', 'salehourid', 'salehourname', 'hour', 'time', 'timeperiod', 'period', 'starttime'].includes(h))
    const hasSales = normalized.some(h => ['saleamount', 'salesamount', 'grosssales', 'total', 'totalinctax', 'amount'].includes(h))
    return hasHour && hasSales
  })
  if (headerIndex < 0) return []

  const header = rows[headerIndex].map(normalizeHeader)
  const findCol = (...names) => {
    const normalized = names.map(normalizeHeader)
    return header.findIndex(h => normalized.includes(h))
  }
  const hourCol = findCol('salehour', 'sale hour', 'salehourname', 'sale hour name', 'hour', 'time', 'time period', 'period', 'start time', 'salehourid')
  const countCol = findCol('salecount', 'sale count', 'number of sales', 'sales', 'orders', 'transactions', 'customers')
  const grossCol = findCol('saleamount', 'sales amount', 'sale amount', 'gross sales', 'total inc tax', 'total', 'amount')
  const netCol = findCol('saleexamount', 'sale ex amount', 'net sales', 'net amount')
  const taxCol = findCol('saletaxamount', 'sale tax amount', 'tax amount', 'tax')
  const aovCol = findCol('averageamount', 'average amount', 'sale average', 'aov')

  const byHour = new Map()
  for (const r of rows.slice(headerIndex + 1)) {
    const fallbackHourCol = r.findIndex(cell => parseHourCell(cell) != null)
    const hour = parseHourCell(r[hourCol >= 0 ? hourCol : fallbackHourCol])
    if (hour == null) continue

    const fallbackSalesCol = r.findIndex((cell, index) => index !== fallbackHourCol && /[$,]|\d/.test(String(cell ?? '')) && num(cell) > 0)
    // Only claim a metric the export actually labels; a guessed column is worse
    // than an honest null.
    const orderCount = countCol >= 0 ? Math.round(num(r[countCol])) : null
    const grossSales = num(r[grossCol >= 0 ? grossCol : fallbackSalesCol])
    const netSales = netCol >= 0 ? num(r[netCol]) : null
    const tax = taxCol >= 0 ? num(r[taxCol]) : null
    const aov = aovCol >= 0
      ? num(r[aovCol])
      : orderCount != null && orderCount > 0 ? grossSales / orderCount : null

    byHour.set(hour, {
      business_date: businessDate,
      hour,
      gross_sales: grossSales,
      net_sales: netSales,
      tax,
      order_count: orderCount,
      aov,
    })
  }
  return [...byHour.values()].sort((a, b) => a.hour - b.hour)
}

export function mapHours(rows, businessDate) {
  const pivotHours = mapPivotHours(rows, businessDate)
  if (pivotHours.length) return pivotHours
  return mapLongHours(rows, businessDate)
}
