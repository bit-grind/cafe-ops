import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type AskBody = { question: string }

const MONTH_MAP: Record<string, number> = {
  jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
  january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12,
}
const MON_PAT = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

function extractDateRangeFromQuestion(q: string): { from: string; to: string } | null {
  const s = q.toLowerCase()
  const now = new Date()
  const todayIso = iso(now)

  const addDays = (d: Date, n: number) => {
    const r = new Date(d); r.setDate(r.getDate() + n); return r
  }

  // "last year" / "past year" → previous calendar year
  if (/\b(last|past)\s+year\b/.test(s)) {
    const y = now.getFullYear() - 1
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  // "this year" / "so far this year"
  if (/\bthis year\b/.test(s)) {
    return { from: `${now.getFullYear()}-01-01`, to: todayIso }
  }
  // "in 2025" / "for 2025" / "during 2025"
  const yearOnly = s.match(/\b(20\d{2})\b/)
  if (yearOnly && !s.match(/\d{4}-\d{2}-\d{2}/) && !s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON_PAT}`)) && !s.match(new RegExp(`${MON_PAT}\\s+\\d{1,2}`))) {
    const y = yearOnly[1]
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  // "last N weeks" / "past N weeks"
  const nWeeks = s.match(/\b(?:last|past)\s+(\d+)[\s\-–]+(?:\d+\s+)?weeks?\b/)
  if (nWeeks) {
    const n = parseInt(nWeeks[1])
    return { from: iso(addDays(now, -n * 7)), to: todayIso }
  }
  // "last week" / "past week"
  if (/\b(last|past)\s+week\b/.test(s)) {
    return { from: iso(addDays(now, -7)), to: todayIso }
  }
  // "this week"
  if (/\bthis\s+week\b/.test(s)) {
    const mon = new Date(now)
    const day = mon.getDay()
    mon.setDate(mon.getDate() - (day === 0 ? 6 : day - 1))
    return { from: iso(mon), to: todayIso }
  }
  // "last N months" / "past N months"
  const nMonths = s.match(/\b(?:last|past)\s+(\d+)\s+months?\b/)
  if (nMonths) {
    return { from: iso(addDays(now, -parseInt(nMonths[1]) * 30)), to: todayIso }
  }
  // "last month" / "past month"
  if (/\b(last|past)\s+month\b/.test(s)) {
    return { from: iso(addDays(now, -30)), to: todayIso }
  }
  // "this month"
  if (/\bthis\s+month\b/.test(s)) {
    return { from: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, to: todayIso }
  }
  // "last N days" / "past N days"
  const nDays = s.match(/\b(?:last|past)\s+(\d+)\s+days?\b/)
  if (nDays) {
    return { from: iso(addDays(now, -parseInt(nDays[1]))), to: todayIso }
  }
  // "last 7 business days" etc — treat like N days
  const nBizDays = s.match(/\b(?:last|past)\s+(\d+)\s+business\s+days?\b/)
  if (nBizDays) {
    return { from: iso(addDays(now, -parseInt(nBizDays[1]) * 1.5)), to: todayIso }
  }

  return null
}

function extractDateFromQuestion(q: string): { date?: string; yearMonth?: { year: string; month: string } } {
  const s = q.toLowerCase()

  // ISO: 2024-03-01
  const iso = s.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (iso) return { date: iso[1] }

  // "1st march 2024" or "1 march 2024"
  const m1 = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON_PAT}\\s+(\\d{4})\\b`))
  if (m1) {
    const month = String(MONTH_MAP[m1[2].slice(0,3)] ?? MONTH_MAP[m1[2]]).padStart(2, '0')
    return { date: `${m1[3]}-${month}-${m1[1].padStart(2, '0')}` }
  }

  // "march 1st 2024" or "march 1 2024"
  const m2 = s.match(new RegExp(`\\b${MON_PAT}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\d{4})\\b`))
  if (m2) {
    const month = String(MONTH_MAP[m2[1].slice(0,3)] ?? MONTH_MAP[m2[1]]).padStart(2, '0')
    return { date: `${m2[3]}-${month}-${m2[2].padStart(2, '0')}` }
  }

  // "march 2024" (month-level)
  const m3 = s.match(new RegExp(`\\b${MON_PAT}\\s+(\\d{4})\\b`))
  if (m3) {
    const month = String(MONTH_MAP[m3[1].slice(0,3)] ?? MONTH_MAP[m3[1]]).padStart(2, '0')
    return { yearMonth: { year: m3[2], month } }
  }

  return {}
}

function startOfWeekMon(d: Date) {
  const x = new Date(d)
  const day = x.getDay() // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day)
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AskBody
    const question = (body.question || '').trim()
    if (!question) return NextResponse.json({ error: 'Missing question' }, { status: 400 })

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

    // Fetch product-level data based on date/range extracted from the question
    const dateRange = extractDateRangeFromQuestion(question)
    const parsed = extractDateFromQuestion(question)
    let products: any[] | null = null
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
    } else if (parsed.date) {
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

    const total = (arr: any[]) => arr.reduce((s, d) => s + Number(d.gross_sales || 0), 0)
    const avg = (arr: any[]) => (arr.length ? total(arr) / arr.length : 0)

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
      const mon = startOfWeekMon(t)
      const prevMon = new Date(mon); prevMon.setDate(prevMon.getDate() - 7)
      const prevSun = new Date(mon); prevSun.setDate(prevSun.getDate() - 1)
      const monIso = iso(mon), prevMonIso = iso(prevMon), prevSunIso = iso(prevSun)
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

    const system = `
You are Cafe Ops AI for a Brisbane cafe.
Use ONLY the provided data. Do not invent numbers.
If the question needs data outside the provided range, say what range is available and what is missing.
Be practical: what happened, why it likely happened (based on the data), and what to do next.
`

    const user = `
Question:
${question}

Precomputed summary metrics (based on sales_business_day):
${JSON.stringify(summary, null, 2)}

Daily totals (last 60 business days, most recent first):
${JSON.stringify(days ?? [], null, 2)}

Product-level sales data available from: ${productDateRange ? `${productDateRange.min} to ${productDateRange.max}` : 'unknown'}
${dateRange ? `Date range queried for products: ${dateRange.from} to ${dateRange.to}` : ''}
${products && products.length > 0
  ? productsAggregated
    ? `Top products aggregated over the queried period (sorted by total quantity sold):\n${JSON.stringify(products, null, 2)}`
    : `Product-level data for the relevant date(s):\n${JSON.stringify(products, null, 2)}`
  : 'No product-level data matched the requested date.'}
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

    const out = await resp.json()
    const answer = out?.choices?.[0]?.message?.content
    if (!answer) return NextResponse.json({ error: 'No answer returned', raw: out }, { status: 500 })

    return NextResponse.json({ answer })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
