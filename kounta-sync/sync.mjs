/**
 * Kounta daily sync.
 *
 * Headless-logs into my.kounta.com, exports the sales summary, by-hour, and by-product
 * reports via Kounta's report export endpoint, and POSTs them to the app's
 * import routes. Designed to run from GitHub Actions (see
 * .github/workflows/kounta-sync.yml).
 *
 * The export endpoint (confirmed by inspection):
 *   GET https://my.kounta.com/report/<report>?export=true&DateFrom=YYYY-MM-DD&DateTo=YYYY-MM-DD&SiteID=0&TerminalID=0
 *   → CSV, authed by the logged-in session cookie.
 *
 * Env:
 *   KOUNTA_USER, KOUNTA_PASS   Kounta login (set as repo secrets)
 *   IMPORT_SECRET              shared secret for the app's import endpoints
 *   APP_URL                    deployed app base URL
 *   SYNC_PRODUCTS              optional; set to "false" for summary/hour-only live
 *                              sales refreshes
 *   SYNC_HOURS                 optional; set to "false" to skip hourly buckets
 *   LIVE_MONITOR_MINUTES       optional; when set, polls the summary every
 *                              LIVE_POLL_SECONDS and imports each sample
 *   LIVE_POLL_SECONDS          optional; defaults to 60 for live monitors
 *   LIVE_STOP_BRISBANE         optional HH:MM cutoff for scheduled live monitors
 *   SYNC_DATE_FROM/TO          optional override (YYYY-MM-DD) for backfills;
 *                              defaults to today's Brisbane business date
 */
import { chromium } from 'playwright'
import { createHmac, randomUUID } from 'crypto'

const { APP_URL: rawAppUrl, KOUNTA_USER, KOUNTA_PASS, IMPORT_SECRET } = process.env

for (const [k, v] of Object.entries({ APP_URL: rawAppUrl, KOUNTA_USER, KOUNTA_PASS, IMPORT_SECRET })) {
  if (!v) { console.error(`Missing required env: ${k}`); process.exit(1) }
}

const APP_URL = rawAppUrl.replace(/\/$/, '')
const SYNC_PRODUCTS = process.env.SYNC_PRODUCTS !== 'false'
const SYNC_HOURS = process.env.SYNC_HOURS !== 'false'
const LIVE_MONITOR_MINUTES = Number.parseInt(process.env.LIVE_MONITOR_MINUTES || '', 10)
const LIVE_POLL_SECONDS = Math.max(15, Number.parseInt(process.env.LIVE_POLL_SECONDS || '60', 10) || 60)
const LIVE_STOP_BRISBANE = process.env.LIVE_STOP_BRISBANE || ''

// ── helpers ────────────────────────────────────────────────────────────────
const num = (s) => {
  const n = parseFloat(String(s ?? '').replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function brisbaneTodayISO() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const y = +p.find(x => x.type === 'year').value
  const m = +p.find(x => x.type === 'month').value
  const d = +p.find(x => x.type === 'day').value
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10)
}

function brisbaneMinuteOfDay() {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Brisbane',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const h = +p.find(x => x.type === 'hour').value
  const m = +p.find(x => x.type === 'minute').value
  return h * 60 + m
}

function parseStopMinute(value) {
  if (!value) return null
  const m = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) throw new Error('LIVE_STOP_BRISBANE must be HH:MM')
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour > 23 || minute > 59) throw new Error('LIVE_STOP_BRISBANE must be HH:MM')
  return hour * 60 + minute
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const normalizeHeader = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

function eachDay(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error('SYNC_DATE_FROM/TO must be a valid ascending YYYY-MM-DD range')
  }
  const out = []
  const d = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
  if (out.length > 90) throw new Error('Refusing to sync more than 90 days in one run')
  return out
}

// Minimal RFC-4180-ish CSV parser (handles quoted fields containing commas).
function parseCsv(text) {
  const rows = []
  let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

function sanitizedRowsForLog(rows) {
  return rows
    .slice(0, 10)
    .map(row => row.slice(0, 12).map(cell => {
      const text = String(cell ?? '').trim()
      if (!text) return ''
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return '<date>'
      if (/^\$?[\d,]+(?:\.\d+)?$/.test(text)) return '<num>'
      if (/^\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s*[-–—]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?$/i.test(text)) return '<time>'
      return text.slice(0, 80)
    }))
}

// summary CSV cols: saledateid, saledate, salecount, saleamount, saleexamount, saletaxamount, averageamount
function mapSummary(rows) {
  const byDate = new Map()
  for (const r of rows.slice(1)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r[1] || '')) continue
    byDate.set(r[1], {
      business_date: r[1],
      gross_sales: num(r[3]),
      net_sales: num(r[4]),
      tax: num(r[5]),
      discounts: 0,
      refunds: 0,
      order_count: Math.round(num(r[2])),
      aov: num(r[6]),
    })
  }
  return [...byDate.values()]
}

// product CSV cols: Position, Product Number, Product, Quantity, % Qty, Sale Amount, % Sale, Cost, % GP
function mapProducts(rows, businessDate) {
  const byProduct = new Map()
  for (const r of rows.slice(1)) {
    const product = String(r[2] ?? '').trim()
    if (!r[0] || !product || product.toLowerCase() === 'total') continue
    byProduct.set(product.toLowerCase(), {
      business_date: businessDate,
      position: Math.round(num(r[0])),
      product,
      quantity: Math.round(num(r[3])),
      quantity_pct: num(r[4]),
      sale_amount: num(r[5]),
      sale_pct: num(r[6]),
      cost: num(r[7]),
      gross_profit_pct: num(r[8]),
    })
  }
  return [...byProduct.values()]
}

function parseHourCell(value) {
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

function parseKountaDateCell(value) {
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
    .map(({ hour, value }) => {
      const grossSales = num(value)
      return {
        business_date: businessDate,
        hour,
        gross_sales: grossSales,
        net_sales: grossSales,
        tax: 0,
        order_count: 0,
        aov: 0,
      }
    })
    .sort((a, b) => a.hour - b.hour)
}

function mapHours(rows, businessDate) {
  const pivotHours = mapPivotHours(rows, businessDate)
  if (pivotHours.length) return pivotHours

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
    const orderCount = Math.round(num(r[countCol >= 0 ? countCol : Math.max(0, fallbackSalesCol - 1)]))
    const grossSales = num(r[grossCol >= 0 ? grossCol : fallbackSalesCol])
    const netSales = netCol >= 0 ? num(r[netCol]) : grossSales
    const tax = taxCol >= 0 ? num(r[taxCol]) : 0
    const aov = aovCol >= 0 ? num(r[aovCol]) : orderCount > 0 ? grossSales / orderCount : 0

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

async function exportCsv(page, report, from, to) {
  const url = `https://my.kounta.com/report/${report}?export=true&DateFrom=${from}&DateTo=${to}&SiteID=0&TerminalID=0`
  return page.evaluate(async (u) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetch(u, { credentials: 'include' })
      if (r.status === 200) return r.text()
      await new Promise(res => setTimeout(res, 1500))
    }
    throw new Error('export failed (non-200 after retries): ' + u)
  }, url)
}

async function postJson(path, payload) {
  const body = JSON.stringify(payload)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = randomUUID()
  const signature = createHmac('sha256', IMPORT_SECRET)
    .update(`${timestamp}.${nonce}.${body}`)
    .digest('hex')
  const r = await fetch(`${APP_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-import-timestamp': timestamp,
      'x-import-nonce': nonce,
      'x-import-signature': signature,
    },
    body,
  })
  const responseBody = await r.text()
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${responseBody.slice(0, 200)}`)
  return responseBody
}

async function login(page) {
  await page.goto('https://my.kounta.com/login', { waitUntil: 'networkidle' })
  const emailSel = 'input[type=email], input[name=username], input[name=email], #username, #email'
  const passSel = 'input[type=password], input[name=password], #password'

  await page.waitForSelector(emailSel, { timeout: 30000 })
  await page.fill(emailSel, KOUNTA_USER)

  // Some logins are two-step (email → Continue → password).
  if (!(await page.$(passSel))) {
    const next = await page.$('button[type=submit], button:has-text("Next"), button:has-text("Continue")')
    if (next) { await next.click(); await page.waitForSelector(passSel, { timeout: 15000 }) }
  }
  await page.fill(passSel, KOUNTA_PASS)

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
    page.click('button[type=submit], input[type=submit], button:has-text("Log in"), button:has-text("Sign in")'),
  ])

  // Land on a report page: confirms the session and puts us on the right origin
  // for the same-origin export fetches.
  await page.goto('https://my.kounta.com/report/salesummary', { waitUntil: 'networkidle' })
  if (/login|sign[-_ ]?in|auth/i.test(page.url())) {
    throw new Error('Login failed — still on ' + page.url())
  }
}

async function importSummary(page, from, to) {
  const summary = mapSummary(parseCsv(await exportCsv(page, 'salesummary', from, to)))
  const summaryByDate = new Map(summary.map(day => [day.business_date, day]))
  for (const day of eachDay(from, to)) {
    if (!summaryByDate.has(day)) throw new Error(`Summary export did not include ${day}`)
  }
  await postJson('/api/import-daily', summary)
  return { summary, summaryByDate }
}

async function importHours(page, day, allowEmpty = false) {
  const rows = parseCsv(await exportCsv(page, 'salesummarybyhour', day, day))
  const hours = mapHours(rows, day)
  if (hours.length === 0 && !allowEmpty) {
    console.log(`Hourly export shape ${day}: ${rows.length} row(s), first row ${rows[0]?.length ?? 0} col(s).`)
    console.log(`Hourly export sample ${day}: ${JSON.stringify(sanitizedRowsForLog(rows))}`)
  }
  await postJson('/api/import-hours', { business_date: day, rows: hours, allow_empty: allowEmpty })
  return hours
}

async function runLiveMonitor(page, from, to) {
  const stopMinute = parseStopMinute(LIVE_STOP_BRISBANE)
  const deadline = Date.now() + LIVE_MONITOR_MINUTES * 60_000
  let lastKey = ''
  let sample = 0

  while (Date.now() < deadline) {
    if (stopMinute != null && brisbaneMinuteOfDay() > stopMinute) {
      console.log(`Live monitor stopping at Brisbane cutoff ${LIVE_STOP_BRISBANE}.`)
      break
    }

    sample += 1
    const sampledAt = new Date().toISOString()
    const { summary, summaryByDate } = await importSummary(page, from, to)
    const subject = summaryByDate.get(to) ?? summary[summary.length - 1]
    const allowEmptyHours = !subject || (subject.order_count === 0 && subject.gross_sales === 0)
    const hours = SYNC_HOURS ? await importHours(page, to, allowEmptyHours) : []
    const key = subject
      ? `${subject.business_date}:${subject.gross_sales}:${subject.order_count}:${subject.aov}`
      : ''
    const changed = sample === 1 ? 'initial' : key === lastKey ? 'no' : 'yes'
    lastKey = key
    console.log(
      `Live sample ${sample} @ ${sampledAt}: date=${subject?.business_date ?? 'n/a'} ` +
      `gross=${subject?.gross_sales ?? 'n/a'} orders=${subject?.order_count ?? 'n/a'} ` +
      `aov=${subject?.aov ?? 'n/a'} hours=${hours.length} changed=${changed}`,
    )

    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    await sleep(Math.min(LIVE_POLL_SECONDS * 1000, remaining))
  }
}

// ── run ──────────────────────────────────────────────────────────────────
const from = process.env.SYNC_DATE_FROM || brisbaneTodayISO()
const to = process.env.SYNC_DATE_TO || from
const syncDays = eachDay(from, to)
const liveMonitor = Number.isFinite(LIVE_MONITOR_MINUTES) && LIVE_MONITOR_MINUTES > 0
console.log(`Kounta ${liveMonitor ? 'live monitor' : SYNC_PRODUCTS ? 'sync' : 'summary sync'}: ${from} → ${to} (app: ${APP_URL})`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
try {
  await login(page)
  console.log('Logged in.')

  if (liveMonitor) {
    await runLiveMonitor(page, from, to)
  } else {
    // Summary report accepts a date range in one request.
    const { summary, summaryByDate } = await importSummary(page, from, to)
    console.log(`Summary: imported ${summary.length} day(s).`)

    if (SYNC_HOURS) {
      let hourTotal = 0
      for (const day of syncDays) {
        const totals = summaryByDate.get(day)
        const allowEmpty = totals.order_count === 0 && totals.gross_sales === 0
        const hours = await importHours(page, day, allowEmpty)
        hourTotal += hours.length
        console.log(`Hours ${day}: imported ${hours.length}.`)
      }
      console.log(`Hours: imported ${hourTotal} bucket(s).`)
    }

    if (SYNC_PRODUCTS) {
      // By-product report aggregates over a range, so pull one day at a time.
      let productTotal = 0
      for (const day of syncDays) {
        const products = mapProducts(parseCsv(await exportCsv(page, 'salesummarybyproduct', day, day)), day)
        const totals = summaryByDate.get(day)
        const allowEmpty = totals.order_count === 0 && totals.gross_sales === 0
        await postJson('/api/import-products', { business_date: day, rows: products, allow_empty: allowEmpty })
        productTotal += products.length
        console.log(`Products ${day}: imported ${products.length}.`)
      }
      console.log(`Done. ${summary.length} summary day(s), ${productTotal} product rows.`)
    } else {
      console.log(`Done. ${summary.length} summary day(s).`)
    }
  }
} catch (e) {
  if (process.env.UPLOAD_DEBUG_SCREENSHOT === 'true') {
    await page.screenshot({ path: 'kounta-sync-error.png', fullPage: true }).catch(() => {})
  }
  console.error('Kounta sync failed:', e?.message || e)
  process.exitCode = 1
} finally {
  await browser.close()
}
