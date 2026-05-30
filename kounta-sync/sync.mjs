/**
 * Kounta → Blue Poppy Ops daily sync.
 *
 * Headless-logs into my.kounta.com, exports the sales summary + by-product
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
 *   APP_URL                    e.g. https://ops.thebluepoppy.co
 *   SYNC_DATE_FROM/TO          optional override (YYYY-MM-DD) for backfills;
 *                              defaults to "yesterday" in Brisbane
 */
import { chromium } from 'playwright'

const APP_URL = (process.env.APP_URL || 'https://ops.thebluepoppy.co').replace(/\/$/, '')
const { KOUNTA_USER, KOUNTA_PASS, IMPORT_SECRET } = process.env

for (const [k, v] of Object.entries({ KOUNTA_USER, KOUNTA_PASS, IMPORT_SECRET })) {
  if (!v) { console.error(`Missing required env: ${k}`); process.exit(1) }
}

// ── helpers ────────────────────────────────────────────────────────────────
const num = (s) => {
  const n = parseFloat(String(s ?? '').replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function brisbaneYesterdayISO() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const y = +p.find(x => x.type === 'year').value
  const m = +p.find(x => x.type === 'month').value
  const d = +p.find(x => x.type === 'day').value
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}

function eachDay(from, to) {
  const out = []
  const d = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
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

// summary CSV cols: saledateid, saledate, salecount, saleamount, saleexamount, saletaxamount, averageamount
function mapSummary(rows) {
  return rows.slice(1).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r[1] || '')).map(r => ({
    business_date: r[1],
    gross_sales: num(r[3]),
    net_sales: num(r[4]),
    tax: num(r[5]),
    discounts: 0,
    refunds: 0,
    order_count: Math.round(num(r[2])),
    aov: num(r[6]),
  }))
}

// product CSV cols: Position, Product Number, Product, Quantity, % Qty, Sale Amount, % Sale, Cost, % GP
function mapProducts(rows, businessDate) {
  return rows.slice(1)
    .filter(r => r[0] && r[2] && r[2].toLowerCase() !== 'total')
    .map(r => ({
      business_date: businessDate,
      position: Math.round(num(r[0])),
      product: r[2],
      quantity: Math.round(num(r[3])),
      quantity_pct: num(r[4]),
      sale_amount: num(r[5]),
      sale_pct: num(r[6]),
      cost: num(r[7]),
      gross_profit_pct: num(r[8]),
    }))
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

async function postJson(path, rows) {
  const r = await fetch(`${APP_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-import-secret': IMPORT_SECRET },
    body: JSON.stringify(rows),
  })
  const body = await r.text()
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${body.slice(0, 200)}`)
  return body
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

// ── run ──────────────────────────────────────────────────────────────────
const from = process.env.SYNC_DATE_FROM || brisbaneYesterdayISO()
const to = process.env.SYNC_DATE_TO || from
console.log(`Kounta sync: ${from} → ${to} (app: ${APP_URL})`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
try {
  await login(page)
  console.log('Logged in.')

  // Summary report accepts a date range in one request.
  const summary = mapSummary(parseCsv(await exportCsv(page, 'salesummary', from, to)))
  await postJson('/api/import-daily', summary)
  console.log(`Summary: imported ${summary.length} day(s).`)

  // By-product report aggregates over a range, so pull one day at a time.
  let productTotal = 0
  for (const day of eachDay(from, to)) {
    const products = mapProducts(parseCsv(await exportCsv(page, 'salesummarybyproduct', day, day)), day)
    await postJson('/api/import-products', products)
    productTotal += products.length
    console.log(`Products ${day}: imported ${products.length}.`)
  }
  console.log(`Done. ${summary.length} summary day(s), ${productTotal} product rows.`)
} catch (e) {
  await page.screenshot({ path: 'kounta-sync-error.png', fullPage: true }).catch(() => {})
  console.error('Kounta sync failed:', e?.message || e)
  process.exitCode = 1
} finally {
  await browser.close()
}
