import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type AskBody = { question: string }

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

    if (error || !days || days.length === 0) {
      return NextResponse.json({ error: error?.message ?? 'No data' }, { status: 500 })
    }

    const total = (arr: any[]) => arr.reduce((s, d) => s + Number(d.gross_sales || 0), 0)
    const avg = (arr: any[]) => (arr.length ? total(arr) / arr.length : 0)

    const today = days[0]
    const last7 = days.slice(0, 7)
    const last30 = days.slice(0, 30)

    const best30 = last30.reduce((a, b) => (Number(a.gross_sales) > Number(b.gross_sales) ? a : b))
    const worst30 = last30.reduce((a, b) => (Number(a.gross_sales) < Number(b.gross_sales) ? a : b))

    const todayVs7AvgPct = avg(last7) > 0 ? ((Number(today.gross_sales) - avg(last7)) / avg(last7)) * 100 : null
    const todayVs30AvgPct = avg(last30) > 0 ? ((Number(today.gross_sales) - avg(last30)) / avg(last30)) * 100 : null

    // week-to-date vs last week (based on latest business_date)
    const t = new Date(today.business_date + 'T00:00:00')
    const mon = startOfWeekMon(t)
    const prevMon = new Date(mon); prevMon.setDate(prevMon.getDate() - 7)
    const prevSun = new Date(mon); prevSun.setDate(prevSun.getDate() - 1)

    const monIso = iso(mon)
    const prevMonIso = iso(prevMon)
    const prevSunIso = iso(prevSun)

    const wtd = days.filter(d => d.business_date >= monIso && d.business_date <= today.business_date)
    const lastWeek = days.filter(d => d.business_date >= prevMonIso && d.business_date <= prevSunIso)

    const wtdSales = total(wtd)
    const lastWeekSales = total(lastWeek)
    const wowPct = lastWeekSales > 0 ? ((wtdSales - lastWeekSales) / lastWeekSales) * 100 : null

    const summary = {
      latest_business_date: today.business_date,
      today: {
        gross_sales: Number(today.gross_sales),
        order_count: Number(today.order_count),
        aov: Number(today.aov),
      },
      last_7_days: {
        total_gross_sales: Number(total(last7).toFixed(2)),
        avg_gross_sales: Number(avg(last7).toFixed(2)),
      },
      last_30_days: {
        total_gross_sales: Number(total(last30).toFixed(2)),
        avg_gross_sales: Number(avg(last30).toFixed(2)),
        best_day: { date: best30.business_date, gross_sales: Number(best30.gross_sales) },
        worst_day: { date: worst30.business_date, gross_sales: Number(worst30.gross_sales) },
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
If the question needs data outside the provided range, say what range you need.
Be practical: what happened, why it likely happened (based on the data), and what to do next.
`

    const user = `
Question:
${question}

Precomputed summary metrics:
${JSON.stringify(summary, null, 2)}

Daily data (last 60 business days, most recent first):
${JSON.stringify(days, null, 2)}
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
