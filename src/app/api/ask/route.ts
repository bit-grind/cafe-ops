import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSessionUser } from '@/lib/adminAuth'
import {
  extractDateFromQuestion,
  extractDateRangeFromQuestion,
  resolveHolidayDate,
} from '@/lib/ask/dateParsing'
import { isoDate, mondayOf } from '@/lib/dates'
import { fmtDate } from '@/lib/fmt'
import { executeAskTool, getAskToolsForRole } from '@/lib/ask/tools'
import { consumeRateLimit } from '@/lib/serverAuth'

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

// ── OpenAI chat-completions shapes (tool calling) ──────────────────────────────
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
type AssistantMessage = { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | AssistantMessage
  | { role: 'tool'; tool_call_id: string; content: string }
type ChatResponse = {
  choices?: Array<{ message?: AssistantMessage; finish_reason?: string }>
  error?: { message?: string }
}

const MODEL = 'gpt-4.1'
const MAX_STEPS = 3
const MAX_TOOL_CALLS = 6
const MAX_TOOL_RESULT_CHARS = 20_000
const MAX_TOTAL_TOOL_RESULT_CHARS = 60_000
const MAX_QUESTION_CHARS = 500

async function openaiChat(messages: ChatMessage[], tools: ReturnType<typeof getAskToolsForRole>['definitions'] | null): Promise<ChatResponse> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured')
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
      max_completion_tokens: 700,
      ...(tools ? { tools, tool_choice: 'auto' } : {}),
    }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!resp.ok) throw new Error(`OpenAI request failed with status ${resp.status}`)
  return (await resp.json()) as ChatResponse
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    if (rawBody.length > 2_000) return NextResponse.json({ error: 'Request body too large' }, { status: 413 })
    const body = JSON.parse(rawBody) as AskBody
    const question = (body.question || '').trim()
    if (!question) return NextResponse.json({ error: 'Missing question' }, { status: 400 })
    if (question.length > MAX_QUESTION_CHARS) return NextResponse.json({ error: 'Question is too long' }, { status: 400 })

    // Authenticate via the shared helper, which resolves the role from the
    // server-controlled user_role table (not user-writable metadata).
    const session = await getSessionUser(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const isGuest = session.isGuest
    const withinLimit = await consumeRateLimit('ask-ai', session.id, {
      windowSeconds: 60,
      limit: isGuest ? 3 : 10,
    })
    if (!withinLimit) return NextResponse.json({ error: 'Too many requests. Please wait a minute and try again.' }, { status: 429 })
    const askTools = getAskToolsForRole(session.role, session.isAdmin)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Seed context: recent daily totals (the agent fetches anything older/deeper
    // via tools). 35 days covers the 30-day metrics plus a little slack.
    const { data: days, error } = await supabase
      .from('sales_business_day')
      .select('business_date,gross_sales,net_sales,tax,discounts,refunds,order_count,aov')
      .order('business_date', { ascending: false })
      .limit(35)
    if (error) {
      console.error('sales_business_day query failed:', error.message)
      return NextResponse.json({ error: 'Unable to load sales data' }, { status: 500 })
    }

    // Product-level data availability (so the AI knows what ranges it can ask for).
    const [rangeMin, rangeMax] = await Promise.all([
      supabase.from('sales_by_product').select('business_date').order('business_date', { ascending: true }).limit(1),
      supabase.from('sales_by_product').select('business_date').order('business_date', { ascending: false }).limit(1),
    ])
    const productDateRange = rangeMin.data?.[0] && rangeMax.data?.[0]
      ? { min: rangeMin.data[0].business_date, max: rangeMax.data[0].business_date }
      : null

    // Resolve any date / holiday / range reference to a concrete date hint. The
    // agent can still query any range itself; this just saves a round-trip on
    // the common cases and keeps the tested holiday mapping in play.
    const holiday = resolveHolidayDate(question)
    const dateRange = !holiday ? extractDateRangeFromQuestion(question) : null
    const parsed = !holiday ? extractDateFromQuestion(question) : { date: holiday.date }

    const dateHints: string[] = []
    if (holiday) {
      dateHints.push(
        `The question refers to ${fmtDate(holiday.date)}${holiday.upcoming
          ? ` — note the upcoming occurrence (${fmtDate(holiday.upcoming)}) hasn't happened yet, so use last year's date ${fmtDate(holiday.date)} for actuals`
          : ''}.`,
      )
    }
    if (dateRange) dateHints.push(`Detected date range: ${fmtDate(dateRange.from)} to ${fmtDate(dateRange.to)}.`)
    if (!holiday && parsed.date) dateHints.push(`Detected specific date: ${fmtDate(parsed.date)} (${parsed.date}).`)
    if (parsed.yearMonth) {
      const { year, month } = parsed.yearMonth
      dateHints.push(`Detected month: ${year}-${month} (query the full calendar month).`)
    }

    // Precomputed headline metrics from the recent window (cheap, deterministic).
    const total = (arr: Day[]) => arr.reduce((s, d) => s + Number(d.gross_sales || 0), 0)
    const avg = (arr: Day[]) => (arr.length ? total(arr) / arr.length : 0)
    const today = days?.[0] ?? null
    const last7 = days?.slice(0, 7) ?? []
    const last30 = days?.slice(0, 30) ?? []
    const best30 = last30.length ? last30.reduce((a, b) => (Number(a.gross_sales) > Number(b.gross_sales) ? a : b)) : null
    const worst30 = last30.length ? last30.reduce((a, b) => (Number(a.gross_sales) < Number(b.gross_sales) ? a : b)) : null
    const todayVs7AvgPct = today && avg(last7) > 0 ? ((Number(today.gross_sales) - avg(last7)) / avg(last7)) * 100 : null
    const todayVs30AvgPct = today && avg(last30) > 0 ? ((Number(today.gross_sales) - avg(last30)) / avg(last30)) * 100 : null

    let wtdSales = 0, lastWeekSales = 0, wowPct: number | null = null
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
      today: today ? { gross_sales: Number(today.gross_sales), order_count: Number(today.order_count), aov: Number(today.aov) } : null,
      last_7_days: { total_gross_sales: Number(total(last7).toFixed(2)), avg_gross_sales: Number(avg(last7).toFixed(2)) },
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

    const actualToday = isoDate(new Date())

    const guestClause = isGuest
      ? `\nIMPORTANT: This user is a guest with READ-ONLY access to sales data only. Do not answer questions about supplier bills, invoice line items, ingredient costs, settings, or configurations. Politely decline those requests.`
      : ''
    const sensitiveToolGuidance = isGuest
      ? ''
      : `
For supplier bills: Status=AUTHORISED means approved but not fully paid (amountDue > 0 is outstanding); Status=PAID means settled. For "unpaid"/"owing"/"outstanding", filter to amountDue > 0. Each bill's lineItems (description, quantity, unitAmount, lineAmount) answer "what did we buy" / "how much did we spend on Y" — sum lineAmount, matching descriptions case-insensitively. lineAmountTypes indicates whether line amounts are tax Inclusive/Exclusive/NoTax.
Extracted supplier line items (search_purchase_line_items) are detailed product-level data read off the actual supplier PDFs (e.g. "Bega Tasty Cheddar 1kg") with unit prices and invoice dates — prefer these for specific product/ingredient and price-change questions.`
    const onDemandData = isGuest
      ? 'older dates, specific days, product breakdowns, weather'
      : 'older dates, specific days, product breakdowns, supplier bills, weather, ingredient costs'

    const system = `
You are Blue Poppy Ops AI for a Brisbane cafe.
Today's actual date is ${actualToday}. Always treat this as "today" — do not confuse it with the latest date in the sales data.

You have TOOLS to fetch data on demand. The prompt seeds you with recent headline metrics and the last 14 days only — for anything else (${onDemandData}) you MUST call the relevant tool rather than guessing. Call multiple tools as needed, then answer. Never invent numbers; if a tool returns no data, say what's missing and what range is available.

Available tools for this user: ${askTools.definitions.map(tool => tool.function.name).join(', ')}.

Be practical: what happened, why it likely happened (from the data), and what to do next.
Always format dates as DD/MM/YY (e.g. 28/02/26, not 2026-02-28). Always format money with a $ prefix in AUD unless a currencyCode says otherwise.
When asked to exclude coffees, drinks, or beverages, filter out any coffee, milk, tea, juice, smoothie, soft drink or other beverage — list only food items.
PRODUCT OUTPUT FORMAT — whenever your answer includes a list or breakdown of products (best sellers, top/most-popular products, product mix, or the products sold on a given day or range), you MUST present that list as a Markdown table in exactly this shape and nothing else for the list itself:
Product Sales (Date Range: DD/MM/YY to DD/MM/YY)
| Rank | Product Name | Quantity Sold | Sales $ | Cost $ | Gross Profit % |
|------|--------------|---------------|---------|--------|----------------|
| 1 | Example Product | 123 | $456.78 | $123.45 | 73.0% |
Table rules: the heading line shows the actual period the data covers (for a single day, use that same date in both positions). Map the fields exactly — Rank = ranking/position, Quantity Sold = quantity, Sales $ = sale_amount, Cost $ = cost, Gross Profit % = gross_profit_pct rendered to one decimal place (e.g. 73.0%). Prefix every money value with $ (AUD). If cost or gross profit is missing for a row, leave that cell blank — never invent a value. Show the top 10 by default; show a different count only if the user asks (e.g. top 20/50). This format applies to EVERY product request, including the quick-prompt buttons and the special-date / holiday options. When the question also asks for other figures (e.g. total gross sales or weather), give those first, then the table.
When the question says "be brief and factual" or "no summary or recommendations", respond with only the requested data points — no summary paragraph, no recommendations, no closing notes.
IMPORTANT: This cafe is significantly busier on weekends (Saturday and Sunday) than weekdays. Always account for day-of-week when analysing trends or comparing days — compare weekdays to weekdays and weekends to weekends. A weekday below the overall average is not necessarily a concern. When identifying "slow" days or making "next week" recommendations, distinguish weekday from weekend expectations.
${sensitiveToolGuidance}${guestClause}
`.trim()

    const recent14 = (days ?? []).slice(0, 14)
    const user = `
Question:
${question}

${dateHints.length ? `Date references detected (use these unless the question clearly means otherwise):\n- ${dateHints.join('\n- ')}\n` : ''}
Precomputed headline metrics (from sales_business_day, recent window):
${JSON.stringify(summary, null, 2)}

Most recent 14 business days (most recent first) — fetch older or more detail with tools:
${JSON.stringify(recent14, null, 2)}

Product-level sales data is available from ${productDateRange ? `${productDateRange.min} to ${productDateRange.max}` : 'an unknown range'}.
`.trim()

    // ── Agent loop ────────────────────────────────────────────────────────────
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]

    let answer: string | null = null
    let toolCallsUsed = 0
    let toolResultChars = 0
    for (let step = 0; step < MAX_STEPS; step++) {
      const forceFinal = step === MAX_STEPS - 1
      const out = await openaiChat(messages, forceFinal ? null : askTools.definitions)
      if (out.error?.message) return NextResponse.json({ error: out.error.message }, { status: 502 })
      const msg = out.choices?.[0]?.message
      if (!msg) return NextResponse.json({ error: 'No response from model' }, { status: 502 })

      messages.push(msg)

      if (!forceFinal && msg.tool_calls && msg.tool_calls.length > 0) {
        if (toolCallsUsed + msg.tool_calls.length > MAX_TOOL_CALLS) {
          return NextResponse.json({ error: 'Ask AI request exceeded its tool-call budget' }, { status: 422 })
        }
        for (const tc of msg.tool_calls) {
          toolCallsUsed++
          let parsedArgs: Record<string, unknown> = {}
          try { parsedArgs = JSON.parse(tc.function.arguments || '{}') } catch { /* bad args → empty */ }
          const result = await executeAskTool(tc.function.name, parsedArgs, { supabase, allowedTools: askTools.allowedNames })
          const content = JSON.stringify(result).slice(0, MAX_TOOL_RESULT_CHARS)
          toolResultChars += content.length
          if (toolResultChars > MAX_TOTAL_TOOL_RESULT_CHARS) {
            return NextResponse.json({ error: 'Ask AI request exceeded its data budget' }, { status: 422 })
          }
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content,
          })
        }
        continue
      }

      answer = msg.content ?? null
      break
    }

    if (!answer) return NextResponse.json({ error: 'No answer returned' }, { status: 502 })

    // Log query (fire-and-forget — don't block the response if this fails).
    void supabase
      .from('ask_queries')
      .insert({
        user_id: session.id,
        email: session.email ?? null,
        question,
        answer: answer.slice(0, 4000),
      })
      .then(({ error: logErr }) => {
        if (logErr) console.error('ask_queries insert failed:', logErr.message)
      })

    return NextResponse.json({ answer })
  } catch (e: unknown) {
    console.error('Ask AI request failed:', e)
    return NextResponse.json({ error: 'Ask AI request failed' }, { status: 500 })
  }
}
