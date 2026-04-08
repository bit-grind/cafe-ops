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

// ── Australian holiday date resolution ────────────────────────────────────────

interface HolidayInfo {
  date: string       // the date to query (always in the past)
  upcoming?: string  // the upcoming occurrence if this year's hasn't happened yet
}

function easterSunday(y: number): Date {
  // Anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, month - 1, day)
}

function nthWeekday(y: number, month: number, weekday: number, n: number): Date {
  // n=1 → first, n=2 → second, n=-1 → last
  if (n > 0) {
    const d = new Date(y, month - 1, 1)
    let count = 0
    while (count < n) {
      if (d.getDay() === weekday) count++
      if (count < n) d.setDate(d.getDate() + 1)
    }
    return d
  } else {
    const d = new Date(y, month, 0) // last day of month
    while (d.getDay() !== weekday) d.setDate(d.getDate() - 1)
    return d
  }
}

function resolveHolidayDate(q: string): HolidayInfo | null {
  const s = q.toLowerCase()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const explicitYear = q.match(/\b(20\d{2})\b/)
  const wantsLast = /\blast\b/.test(s)

  function pickYear(holidayFn: (y: number) => Date): HolidayInfo {
    if (explicitYear) return { date: iso(holidayFn(parseInt(explicitYear[1]))) }
    const thisYearDate = holidayFn(today.getFullYear())
    thisYearDate.setHours(0, 0, 0, 0)
    // If the holiday hasn't happened yet this year (or user said "last"), use last year's occurrence.
    // Return the upcoming date so the AI can reference it.
    if (thisYearDate > today || wantsLast) {
      const pastDate = thisYearDate <= today
        ? thisYearDate
        : holidayFn(today.getFullYear() - 1)
      return {
        date: iso(pastDate),
        upcoming: thisYearDate > today ? iso(thisYearDate) : undefined,
      }
    }
    return { date: iso(thisYearDate) }
  }

  if (/mother'?s?\s*day/.test(s))    return pickYear(y => nthWeekday(y, 5, 0, 2))  // 2nd Sun May
  if (/father'?s?\s*day/.test(s))    return pickYear(y => nthWeekday(y, 9, 0, 1))  // 1st Sun Sep (QLD)
  if (/australia\s*day/.test(s))      return pickYear(y => new Date(y, 0, 26))
  if (/anzac\s*day/.test(s))          return pickYear(y => new Date(y, 3, 25))
  if (/christmas\s*day|xmas\s*day/.test(s)) return pickYear(y => new Date(y, 11, 25))
  if (/boxing\s*day/.test(s))         return pickYear(y => new Date(y, 11, 26))
  if (/new\s*year'?s?\s*day/.test(s)) return pickYear(y => new Date(y, 0, 1))
  if (/new\s*year'?s?\s*eve/.test(s)) return pickYear(y => new Date(y - 1, 11, 31))
  if (/good\s*friday/.test(s))        return pickYear(y => { const e = easterSunday(y); e.setDate(e.getDate() - 2); return e })
  if (/easter\s*monday/.test(s))      return pickYear(y => { const e = easterSunday(y); e.setDate(e.getDate() + 1); return e })
  if (/easter/.test(s))               return pickYear(y => easterSunday(y))
  if (/queens?\s*birthday|king'?s?\s*birthday/.test(s)) return pickYear(y => nthWeekday(y, 6, 1, 2)) // 2nd Mon Jun (QLD)
  if (/labour\s*day|labor\s*day/.test(s))               return pickYear(y => nthWeekday(y, 5, 1, 1)) // 1st Mon May (QLD)

  return null
}

// ── Brisbane historical weather (Open-Meteo, free, no key) ────────────────────

const WMO_CODES: Record<number, string> = {
  0:'Clear sky', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
  45:'Fog', 48:'Icy fog', 51:'Light drizzle', 53:'Moderate drizzle', 55:'Heavy drizzle',
  61:'Slight rain', 63:'Moderate rain', 65:'Heavy rain',
  71:'Slight snow', 73:'Moderate snow', 75:'Heavy snow',
  80:'Slight showers', 81:'Moderate showers', 82:'Violent showers',
  95:'Thunderstorm', 96:'Thunderstorm with hail', 99:'Heavy thunderstorm with hail',
}

async function fetchBrisbaneWeather(date: string): Promise<Record<string, any> | null> {
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=-27.47&longitude=153.02&start_date=${date}&end_date=${date}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=Australia%2FBrisbane`
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return null
    const data = await resp.json()
    const d = data.daily
    if (!d) return null
    const code = d.weathercode?.[0]
    return {
      date,
      max_temp_c: d.temperature_2m_max?.[0],
      min_temp_c: d.temperature_2m_min?.[0],
      precipitation_mm: d.precipitation_sum?.[0],
      conditions: code != null ? (WMO_CODES[code] ?? `Code ${code}`) : 'Unknown',
    }
  } catch { return null }
}

function needsWeather(q: string): boolean {
  return /\b(weather|temperature|temp|hot|cold|warm|rain|sunny|cloudy|forecast|humid|wind)\b/i.test(q)
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

    // Resolve holiday names to dates first, then fall through to normal parsing
    const holiday = resolveHolidayDate(question)
    const dateRange = !holiday ? extractDateRangeFromQuestion(question) : null
    const parsed = !holiday ? extractDateFromQuestion(question) : { date: holiday.date }

    // Fetch weather if question asks for it and we have a specific date
    const targetDate = holiday?.date ?? parsed.date ?? null
    const weatherData = (needsWeather(question) && targetDate)
      ? await fetchBrisbaneWeather(targetDate)
      : null
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
    } else if (parsed.date && parsed.date <= iso(new Date())) {
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

    const actualToday = iso(new Date())

    const system = `
You are Cafe Ops AI for a Brisbane cafe.
Today's actual date is ${actualToday}. Always use this as "today" — do not confuse it with the latest date in the sales data.
Use ONLY the provided data. Do not invent numbers.
If the question needs data outside the provided range, say what range is available and what is missing.
Be practical: what happened, why it likely happened (based on the data), and what to do next.
Always format dates as DD/MM/YY (e.g. 28/02/26, not 2026-02-28).
When asked to exclude coffees, drinks, or beverages from a product list, filter out any item that is a coffee, milk, tea, juice, smoothie, soft drink, or other beverage. Only list food items.
`

    const user = `
Question:
${question}

Precomputed summary metrics (based on sales_business_day):
${JSON.stringify(summary, null, 2)}

Daily totals (last 60 business days, most recent first):
${JSON.stringify(days ?? [], null, 2)}

Product-level sales data available from: ${productDateRange ? `${productDateRange.min} to ${productDateRange.max}` : 'unknown'}
${holiday ? `Holiday/event resolved to date: ${holiday.date}${holiday.upcoming ? ` (showing last year's data — the upcoming occurrence is on ${holiday.upcoming}, which hasn't happened yet)` : ''}` : ''}
${dateRange ? `Date range queried for products: ${dateRange.from} to ${dateRange.to}` : ''}
${weatherData ? `Brisbane weather on ${weatherData.date}: ${weatherData.conditions}, max ${weatherData.max_temp_c}°C, min ${weatherData.min_temp_c}°C, ${weatherData.precipitation_mm}mm rain` : ''}
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
