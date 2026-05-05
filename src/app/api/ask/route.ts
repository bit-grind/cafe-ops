import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listBills, getXeroConnection, type BillSummary } from '@/lib/xero'
import {
  extractDateFromQuestion,
  extractDateRangeFromQuestion,
  resolveHolidayDate,
} from '@/lib/ask/dateParsing'
import { fetchBrisbaneWeather } from '@/lib/ask/weather'
import { needsBills, needsWeather } from '@/lib/ask/triggers'
import { isoDate, mondayOf } from '@/lib/dates'
import { fmtDate } from '@/lib/fmt'

type AskBody = { question: string }
type Day = {
  business_date: string
  gross_sales: number
  net_sales: number
  tax: number
  discounts: number
  refunds: number
  order_count: number
  aov: number
}

type SpecificDayTotals = Pick<Day, 'business_date' | 'gross_sales' | 'net_sales' | 'tax' | 'order_count' | 'aov'>

type ProductRow = {
  business_date: string
  position: number
  product: string
  quantity: number
  sale_amount: number | null
  cost: number | null
  gross_profit_pct: number | null
}

type AggregatedProductRow = {
  product: string
  quantity: number
  sale_amount?: number | null
  cost?: number | null
  gross_profit_pct?: number | null
}

type ExtractedLineItemRow = {
  description: string
  quantity: number | null
  unit_price: number | null
  total: number | null
  extraction_runs:
    | {
        supplier_name: string | null
        invoice_date: string | null
      }
    | Array<{
        supplier_name: string | null
        invoice_date: string | null
      }>
    | null
}

type ExtractionRunRelation = {
  supplier_name: string | null
  invoice_date: string | null
}

type OpenAIResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

function pickExtractionRun(run: ExtractedLineItemRow['extraction_runs']): ExtractionRunRelation | null {
  if (!run) return null
  return Array.isArray(run) ? (run[0] ?? null) : run
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AskBody
    const question = (body.question || '').trim()
    if (!question) return NextResponse.json({ error: 'Missing question' }, { status: 400 })

    // Check auth and block guest accounts
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const { data: { user: authUser } } = await anonClient.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const isGuest = authUser.user_metadata?.role === 'guest' || authUser.email === 'guest@example.com'

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: days, error } = await supabase
      .from('sales_business_day')
      .select('business_date,gross_sales,net_sales,tax,discounts,refunds,order_count,aov')
      .order('business_date', { ascending: false })
      .limit(60)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Resolve holiday names to dates first, then fall through to normal parsing
    const holiday = resolveHolidayDate(question)
    const dateRange = !holiday ? extractDateRangeFromQuestion(question) : null
    const parsed = !holiday ? extractDateFromQuestion(question) : { date: holiday.date }

    // Fetch weather if question asks for it and we have a specific date
    const targetDate = holiday?.date ?? parsed.date ?? null
    const weatherData = (needsWeather(question) && targetDate)
      ? await fetchBrisbaneWeather(targetDate)
      : null

    // Fetch Xero bills if the question mentions them. Guests are already
    // blocked from modifying data, but bills are still business data we
    // allow read-only for them. Skip if no Xero connection yet.
    let billsData: BillSummary[] | null = null
    let billsConnected = false
    let billsTenantName: string | null = null
    let billsError: string | null = null
    if (needsBills(question)) {
      try {
        const conn = await getXeroConnection()
        if (conn) {
          billsConnected = true
          billsTenantName = conn.tenant_name
          // If the question has a date range, scope to it; otherwise default
          // to bills from the last 12 months so prompts like "unpaid bills"
          // still get recent history without blowing up the prompt.
          const today = new Date()
          const yearAgo = new Date(today); yearAgo.setFullYear(today.getFullYear() - 1)
          const from = dateRange?.from ?? isoDate(yearAgo)
          const to = dateRange?.to ?? isoDate(today)
          // Fetch with line items so the AI can answer detail questions
          // ("what was on the Bunnings bill from March?", "how much did we
          // spend on milk last month?", etc.).
          billsData = await listBills({ dateFrom: from, dateTo: to }, { includeLineItems: true })
          // Cap to keep prompt size reasonable — line items are chatty.
          if (billsData.length > 60) billsData = billsData.slice(0, 60)
        }
      } catch (e: unknown) {
        billsError = e instanceof Error ? e.message : 'Failed to fetch Xero bills'
        console.error('Xero bills fetch failed:', billsError)
      }
    }

    // Fetch the specific day's totals if not already in the 60-day window
    let specificDayTotals: SpecificDayTotals | null = null
    if (targetDate) {
      specificDayTotals = days?.find(d => d.business_date === targetDate) ?? null
      if (!specificDayTotals) {
        const { data: sd } = await supabase
          .from('sales_business_day')
          .select('business_date,gross_sales,net_sales,tax,order_count,aov')
          .eq('business_date', targetDate)
          .maybeSingle()
        specificDayTotals = sd ?? null
      }
    }

    let products: Array<ProductRow | AggregatedProductRow> | null = null
    let productsAggregated = false
    let productDateRange: { min: string; max: string } | null = null

    const [rangeMin, rangeMax] = await Promise.all([
      supabase.from('sales_by_product').select('business_date').order('business_date', { ascending: true }).limit(1),
      supabase.from('sales_by_product').select('business_date').order('business_date', { ascending: false }).limit(1),
    ])
    if (rangeMin.data?.[0] && rangeMax.data?.[0]) {
      productDateRange = { min: rangeMin.data[0].business_date, max: rangeMax.data[0].business_date }
    }

    if (dateRange) {
      // Multi-day range → aggregate via DB function
      const { data: agg } = await supabase.rpc('get_top_products', {
        date_from: dateRange.from,
        date_to: dateRange.to,
        top_n: 50,
      })
      products = agg ?? null
      productsAggregated = true
    } else if (parsed.date && parsed.date <= isoDate(new Date())) {
      // Single specific date → raw rows
      const { data: pd } = await supabase
        .from('sales_by_product')
        .select('business_date,position,product,quantity,sale_amount,cost,gross_profit_pct')
        .eq('business_date', parsed.date)
        .order('position', { ascending: true })
      products = pd ?? null
    } else if (parsed.yearMonth) {
      // Specific month → aggregate
      const { year, month } = parsed.yearMonth
      const { data: agg } = await supabase.rpc('get_top_products', {
        date_from: `${year}-${month}-01`,
        date_to: `${year}-${month}-31`,
        top_n: 50,
      })
      products = agg ?? null
      productsAggregated = true
    }

    // Fallback: most recent day's products
    if (!products || products.length === 0) {
      const { data: pd } = await supabase
        .from('sales_by_product')
        .select('business_date,position,product,quantity,sale_amount,cost,gross_profit_pct')
        .order('business_date', { ascending: false })
        .order('position', { ascending: true })
        .limit(80)
      products = pd ?? null
    }

    const total = (arr: Day[]) => arr.reduce((s, d) => s + Number(d.gross_sales || 0), 0)
    const avg = (arr: Day[]) => (arr.length ? total(arr) / arr.length : 0)

    const today = days?.[0] ?? null
    const last7 = days?.slice(0, 7) ?? []
    const last30 = days?.slice(0, 30) ?? []

    const best30 = last30.length ? last30.reduce((a, b) => (Number(a.gross_sales) > Number(b.gross_sales) ? a : b)) : null
    const worst30 = last30.length ? last30.reduce((a, b) => (Number(a.gross_sales) < Number(b.gross_sales) ? a : b)) : null

    const todayVs7AvgPct = today && avg(last7) > 0 ? ((Number(today.gross_sales) - avg(last7)) / avg(last7)) * 100 : null
    const todayVs30AvgPct = today && avg(last30) > 0 ? ((Number(today.gross_sales) - avg(last30)) / avg(last30)) * 100 : null

    let wtdSales = 0, lastWeekSales = 0, wowPct = null
    if (today) {
      const t = new Date(today.business_date + 'T00:00:00')
      const mon = mondayOf(t)
      const prevMon = new Date(mon); prevMon.setDate(prevMon.getDate() - 7)
      const prevSun = new Date(mon); prevSun.setDate(prevSun.getDate() - 1)
      const monIso = isoDate(mon), prevMonIso = isoDate(prevMon), prevSunIso = isoDate(prevSun)
      const wtd = (days ?? []).filter(d => d.business_date >= monIso && d.business_date <= today.business_date)
      const lastWeek = (days ?? []).filter(d => d.business_date >= prevMonIso && d.business_date <= prevSunIso)
      wtdSales = total(wtd)
      lastWeekSales = total(lastWeek)
      wowPct = lastWeekSales > 0 ? ((wtdSales - lastWeekSales) / lastWeekSales) * 100 : null
    }

    const summary = {
      latest_business_date: today?.business_date ?? null,
      today: today ? {
        gross_sales: Number(today.gross_sales),
        order_count: Number(today.order_count),
        aov: Number(today.aov),
      } : null,
      last_7_days: {
        total_gross_sales: Number(total(last7).toFixed(2)),
        avg_gross_sales: Number(avg(last7).toFixed(2)),
      },
      last_30_days: {
        total_gross_sales: Number(total(last30).toFixed(2)),
        avg_gross_sales: Number(avg(last30).toFixed(2)),
        best_day: best30 ? { date: best30.business_date, gross_sales: Number(best30.gross_sales) } : null,
        worst_day: worst30 ? { date: worst30.business_date, gross_sales: Number(worst30.gross_sales) } : null,
      },
      comparisons: {
        today_vs_7day_avg_pct: todayVs7AvgPct === null ? null : Number(todayVs7AvgPct.toFixed(1)),
        today_vs_30day_avg_pct: todayVs30AvgPct === null ? null : Number(todayVs30AvgPct.toFixed(1)),
        week_to_date_gross_sales: Number(wtdSales.toFixed(2)),
        last_week_gross_sales: Number(lastWeekSales.toFixed(2)),
        wtd_vs_last_week_pct: wowPct === null ? null : Number(wowPct.toFixed(1)),
      },
    }

    // ── Extracted invoice line items (from AI-scanned PDFs) ──────────────────
    // If the question mentions specific products, ingredients, or suppliers,
    // search the extracted line items table for relevant results.
    let extractedItems: Array<{
      description: string
      quantity: number | null
      unit_price: number | null
      total: number | null
      supplier: string | null
      invoice_date: string | null
    }> | null = null

    // Always try to search extracted line items — the cost is a single
    // ILIKE query and the benefit is product-level purchase data from
    // actual supplier PDFs. Extract candidate search terms from the
    // question: any word 3+ chars that isn't a common stop word.
    {
      try {
        const stopWords = new Set([
          'what','were','with','that','this','from','have','been','does',
          'about','much','last','did','the','and','for','how','our','was',
          'are','has','many','there','they','than','them','then','will',
          'would','could','should','their','which','where','when','your',
          'week','month','year','today','total','sales','gross','compare',
          'trend','best','worst','day','days',
        ])
        const words = question.toLowerCase().match(/\b[a-z]{3,}\b/g)?.filter(w => !stopWords.has(w)) ?? []

        if (words.length > 0) {
          // Search for each word and combine results (limit to top 50)
          const pattern = words.slice(0, 5).map(w => `%${w}%`)
          let query = supabase
            .from('extracted_line_items')
            .select('description, quantity, unit_price, total, xero_invoice_id, extraction_runs!inner(supplier_name, invoice_date)')
            .limit(50)

          // Use OR condition for multiple search terms
          if (pattern.length === 1) {
            query = query.ilike('description', pattern[0])
          } else {
            query = query.or(pattern.map(p => `description.ilike.${p}`).join(','))
          }

          const { data: eiData } = await query
          if (eiData && eiData.length > 0) {
            extractedItems = (eiData as ExtractedLineItemRow[]).map((r) => {
              const run = pickExtractionRun(r.extraction_runs)
              return {
                description: r.description,
                quantity: r.quantity,
                unit_price: r.unit_price,
                total: r.total,
                supplier: run?.supplier_name ?? null,
                invoice_date: run?.invoice_date ?? null,
              }
            })
          }
        }
      } catch { /* non-fatal — extracted items are a bonus, not required */ }
    }

    const actualToday = isoDate(new Date())

    const guestClause = isGuest
      ? `\nIMPORTANT: This user is a guest with READ-ONLY access. You may answer questions about sales data, products, trends, general business metrics, and supplier bills (including specific line items, amounts, and suppliers). If the user asks you to modify, delete, update, or change any data, settings, or configurations, politely decline and explain that guests have read-only access.`
      : ''

    const system = `
You are Cafe Ops AI for a Brisbane cafe.
Today's actual date is ${actualToday}. Always use this as "today" — do not confuse it with the latest date in the sales data.
Use ONLY the provided data. Do not invent numbers.
If the question needs data outside the provided range, say what range is available and what is missing.
Be practical: what happened, why it likely happened (based on the data), and what to do next.
Always format dates as DD/MM/YY (e.g. 28/02/26, not 2026-02-28).
When asked to exclude coffees, drinks, or beverages from a product list, filter out any item that is a coffee, milk, tea, juice, smoothie, soft drink, or other beverage. Only list food items.
When the question asks to "be brief and factual" or says "no summary or recommendations", respond with only the requested data points — no summary paragraph, no recommendations section, no closing notes.
IMPORTANT: This cafe is significantly busier on weekends (Saturday and Sunday) than weekdays. Always account for day-of-week when analysing trends or comparing days. A weekday below the overall average is not necessarily a concern — compare weekdays to weekdays and weekends to weekends. When identifying "slow" days or drops, note whether it is a weekday or weekend and adjust the interpretation accordingly. When making recommendations for "next week", distinguish between weekday and weekend expectations.
When supplier bills from Xero are included in the context: "Status=AUTHORISED" means the bill has been approved but not yet fully paid, so amountDue > 0 is outstanding. "Status=PAID" means it is fully settled. Totals are in AUD unless the currencyCode says otherwise. When asked about "unpaid", "owing", or "outstanding" bills, filter to those where amountDue > 0. When asked about bills for a specific supplier, match case-insensitively on contactName. Always format bill amounts as currency with a $ prefix.
Each bill has a lineItems array with description, quantity, unitAmount, lineAmount, accountCode and taxType — use these to answer questions about what was bought ("what did we buy from X", "how much did we spend on Y", "what's the line item breakdown"). When summing category spend (e.g. "how much did we spend on milk?"), match descriptions case-insensitively and sum lineAmount. lineAmountTypes tells you whether line amounts are tax-inclusive ("Inclusive"), exclusive ("Exclusive"), or "NoTax" — bear this in mind when totals don't tie exactly.
When "Extracted invoice line items" are provided, these are detailed product-level data read directly from the supplier PDF invoices using AI. They contain the actual items purchased (e.g. "Bega Tasty Cheddar 1kg"), quantities, and unit prices — much more granular than Xero's accounting line items. Prefer these when answering specific product/ingredient questions. Each extracted item includes the supplier name and invoice date for context.${guestClause}
`

    const user = `
Question:
${question}

Precomputed summary metrics (based on sales_business_day):
${JSON.stringify(summary, null, 2)}

Daily totals (last 60 business days, most recent first):
${JSON.stringify(days ?? [], null, 2)}

Product-level sales data available from: ${productDateRange ? `${productDateRange.min} to ${productDateRange.max}` : 'unknown'}
${holiday ? `Holiday/event resolved to date: ${fmtDate(holiday.date)}${holiday.upcoming ? ` (showing last year's data — the upcoming occurrence is on ${fmtDate(holiday.upcoming)}, which hasn't happened yet)` : ''}` : ''}
${specificDayTotals ? `Daily totals for ${fmtDate(specificDayTotals.business_date)}: gross_sales=$${specificDayTotals.gross_sales}, order_count=${specificDayTotals.order_count}, aov=$${specificDayTotals.aov}, net_sales=$${specificDayTotals.net_sales}, tax=$${specificDayTotals.tax}` : ''}
${dateRange ? `Date range queried for products: ${fmtDate(dateRange.from)} to ${fmtDate(dateRange.to)}` : ''}
${weatherData ? `Brisbane weather on ${fmtDate(weatherData.date)}: ${weatherData.conditions}, max ${weatherData.max_temp_c}°C, min ${weatherData.min_temp_c}°C, ${weatherData.precipitation_mm}mm rain` : ''}
${needsBills(question) && !billsConnected ? `Xero is not yet connected — bill data is unavailable. Tell the user an admin needs to connect Xero on the Bills page.` : ''}
${billsError ? `Xero bill lookup failed: ${billsError}` : ''}
${billsData && billsData.length > 0
  ? `Supplier bills from Xero${billsTenantName ? ` (${billsTenantName})` : ''} — type ACCPAY, showing up to 150 most recent:\n${JSON.stringify(billsData, null, 2)}`
  : ''}
${products && products.length > 0
  ? productsAggregated
    ? `Top products aggregated over the queried period (sorted by total quantity sold):\n${JSON.stringify(products, null, 2)}`
    : `Product-level data for the relevant date(s):\n${JSON.stringify(products, null, 2)}`
  : 'No product-level data matched the requested date.'}
${extractedItems && extractedItems.length > 0
  ? `\nExtracted invoice line items (from AI-scanned supplier PDFs — detailed product-level purchase data):\n${JSON.stringify(extractedItems, null, 2)}`
  : ''}
`

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: system.trim() },
          { role: 'user', content: user.trim() },
        ],
        temperature: 0.2,
      }),
    })

    const out = (await resp.json()) as OpenAIResponse
    const answer = out?.choices?.[0]?.message?.content
    if (!answer) return NextResponse.json({ error: 'No answer returned', raw: out }, { status: 500 })

    // Log query (fire-and-forget — don't block the response if this fails).
    void supabase
      .from('ask_queries')
      .insert({
        user_id: authUser.id,
        email: authUser.email ?? null,
        question,
        answer: typeof answer === 'string' ? answer.slice(0, 4000) : null,
      })
      .then(({ error: logErr }) => {
        if (logErr) console.error('ask_queries insert failed:', logErr.message)
      })

    return NextResponse.json({ answer })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
