import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type AskBody = {
  question: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AskBody
    const question = (body.question || '').trim()

    if (!question) {
      return NextResponse.json({ error: 'Missing question' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: days, error } = await supabase
      .from('sales_business_day')
      .select('business_date,gross_sales,order_count,aov')
      .order('business_date', { ascending: false })
      .limit(7)

    if (error || !days) {
      return NextResponse.json({ error: error?.message ?? 'No data' }, { status: 500 })
    }

    const total = days.reduce((s, d) => s + Number(d.gross_sales), 0)
    const avg = total / days.length
    const best = days.reduce((a, b) => a.gross_sales > b.gross_sales ? a : b)
    const worst = days.reduce((a, b) => a.gross_sales < b.gross_sales ? a : b)

    const today = days[0]
    const pctVsAvg = ((today.gross_sales - avg) / avg) * 100

    const trend =
      days[0].gross_sales > days[days.length - 1].gross_sales
        ? 'Upward'
        : 'Downward or flat'

    const summary = {
      total7Days: total,
      avg7Days: Math.round(avg),
      bestDay: best,
      worstDay: worst,
      todayVsAvgPercent: pctVsAvg.toFixed(1),
      trend
    }

    const system = `
You are Cafe Ops AI for a Brisbane cafe.
Use ONLY provided numbers.
Be practical.
Focus on what happened, why, and what to do.
No fluff.
`

    const user = `
Question:
${question}

Summary metrics:
${JSON.stringify(summary, null, 2)}

Raw data:
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
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
      }),
    })

    const out = await resp.json()
    const answer = out?.choices?.[0]?.message?.content

    return NextResponse.json({ answer })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
