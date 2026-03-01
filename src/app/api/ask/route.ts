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

    // Server-side Supabase client (service role) so the browser never needs DB permissions
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const supabase = createClient(supabaseUrl, serviceKey)

    // Pull last 7 business days (you can change later)
    const { data: days, error } = await supabase
      .from('sales_business_day')
      .select('business_date,gross_sales,net_sales,tax,discounts,refunds,order_count,aov')
      .order('business_date', { ascending: false })
      .limit(7)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 })
    }

    const system = `
You are Cafe Ops AI for a cafe in Brisbane.
Use ONLY the provided data. Do not invent numbers.
If the question needs data you don't have, say what's missing and suggest what range to pull.
Keep answers practical: what happened, why, and what to do next.
`

    const user = `
Question: ${question}

Data (last 7 business days, most recent first):
${JSON.stringify(days ?? [], null, 2)}
`

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
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

    if (!answer) {
      return NextResponse.json({ error: 'No answer returned', raw: out }, { status: 500 })
    }

    return NextResponse.json({ answer })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
