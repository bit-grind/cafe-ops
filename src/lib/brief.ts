import type { SupabaseClient } from '@supabase/supabase-js'
import { isoDate, mondayOf } from '@/lib/dates'
import { fmtDate, money } from '@/lib/fmt'
import { getPriceWatch, type PriceChange } from '@/lib/priceWatch'

/**
 * Daily brief: a short, proactive "morning read" on the most recent completed
 * business day, computed deterministically and then narrated by the AI. Stored
 * one-row-per-day in public.daily_brief so the dashboard can show it instantly
 * and a cron can pre-generate it each morning.
 */

type Day = {
  business_date: string
  gross_sales: number
  net_sales: number
  order_count: number
  aov: number
}

type ProductRow = { product: string; quantity: number; sale_amount: number | null }

export type DailyBriefRow = {
  brief_date: string
  generated_at: string
  metrics: Record<string, unknown>
  narrative: string
  model: string | null
  generation_status?: 'generating' | 'completed' | 'failed'
}

const BRIEF_SELECT = 'brief_date,generated_at,metrics,narrative,model,generation_status'
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// Weekday of a 'YYYY-MM-DD' calendar date, TZ-independent (0=Sun … 6=Sat).
const dowOf = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay()
const isWeekend = (d: string) => { const x = dowOf(d); return x === 0 || x === 6 }
const round2 = (n: number) => Number(n.toFixed(2))
const round1 = (n: number) => Number(n.toFixed(1))

/** Build the metric pack the narrative is written from. */
export function computeMetrics(days: Day[], products: ProductRow[]) {
  const subject = days[0]
  const subjectDow = dowOf(subject.business_date)

  // Prior days of the same weekday (most recent first), used for a fair comparison.
  const sameWeekday = days.slice(1).filter(d => dowOf(d.business_date) === subjectDow)
  const recentSameWeekday = sameWeekday.slice(0, 4)
  const sameWeekdayAvg = recentSameWeekday.length
    ? recentSameWeekday.reduce((s, d) => s + Number(d.gross_sales || 0), 0) / recentSameWeekday.length
    : null
  const prevSameWeekday = sameWeekday[0] ?? null

  const last30 = days.slice(0, 30)
  const avg30 = last30.length ? last30.reduce((s, d) => s + Number(d.gross_sales || 0), 0) / last30.length : null
  const best30 = last30.length ? last30.reduce((a, b) => (Number(a.gross_sales) > Number(b.gross_sales) ? a : b)) : null
  const worst30 = last30.length ? last30.reduce((a, b) => (Number(a.gross_sales) < Number(b.gross_sales) ? a : b)) : null

  // Week-to-date vs the same span of last week (Mon-anchored, Sydney/Brisbane).
  const t = new Date(subject.business_date + 'T00:00:00')
  const mon = mondayOf(t)
  const prevMon = new Date(mon); prevMon.setDate(prevMon.getDate() - 7)
  const prevEquiv = new Date(t); prevEquiv.setDate(t.getDate() - 7)
  const monIso = isoDate(mon), prevMonIso = isoDate(prevMon), prevEquivIso = isoDate(prevEquiv)
  const sum = (arr: Day[]) => arr.reduce((s, d) => s + Number(d.gross_sales || 0), 0)
  const wtd = sum(days.filter(d => d.business_date >= monIso && d.business_date <= subject.business_date))
  const lastWeekSameSpan = sum(days.filter(d => d.business_date >= prevMonIso && d.business_date <= prevEquivIso))

  const gross = Number(subject.gross_sales || 0)
  const vsSameWeekdayAvgPct = sameWeekdayAvg && sameWeekdayAvg > 0 ? ((gross - sameWeekdayAvg) / sameWeekdayAvg) * 100 : null
  const vsPrevSameWeekdayPct = prevSameWeekday && Number(prevSameWeekday.gross_sales) > 0
    ? ((gross - Number(prevSameWeekday.gross_sales)) / Number(prevSameWeekday.gross_sales)) * 100 : null
  const wtdVsLastWeekPct = lastWeekSameSpan > 0 ? ((wtd - lastWeekSameSpan) / lastWeekSameSpan) * 100 : null

  const topProducts = products
    .filter(p => Number(p.quantity) > 0)
    .sort((a, b) => Number(b.quantity) - Number(a.quantity))
    .slice(0, 5)
    .map(p => ({ product: p.product, quantity: Number(p.quantity), sale_amount: p.sale_amount == null ? null : Number(p.sale_amount) }))

  return {
    subject_date: subject.business_date,
    day_of_week: DOW_NAMES[subjectDow],
    is_weekend: isWeekend(subject.business_date),
    gross_sales: round2(gross),
    net_sales: round2(Number(subject.net_sales || 0)),
    order_count: Number(subject.order_count || 0),
    aov: round2(Number(subject.aov || 0)),
    same_weekday_avg_gross: sameWeekdayAvg == null ? null : round2(sameWeekdayAvg),
    vs_same_weekday_avg_pct: vsSameWeekdayAvgPct == null ? null : round1(vsSameWeekdayAvgPct),
    prev_same_weekday: prevSameWeekday ? { date: prevSameWeekday.business_date, gross_sales: round2(Number(prevSameWeekday.gross_sales)) } : null,
    vs_prev_same_weekday_pct: vsPrevSameWeekdayPct == null ? null : round1(vsPrevSameWeekdayPct),
    last_30_day_avg_gross: avg30 == null ? null : round2(avg30),
    best_day_30: best30 ? { date: best30.business_date, gross_sales: round2(Number(best30.gross_sales)) } : null,
    worst_day_30: worst30 ? { date: worst30.business_date, gross_sales: round2(Number(worst30.gross_sales)) } : null,
    week_to_date_gross: round2(wtd),
    last_week_same_span_gross: round2(lastWeekSameSpan),
    wtd_vs_last_week_pct: wtdVsLastWeekPct == null ? null : round1(wtdVsLastWeekPct),
    top_products: topProducts,
  }
}

type Metrics = ReturnType<typeof computeMetrics>

/** Deterministic fallback used if the AI call fails — the card still shows. */
function fallbackNarrative(m: Metrics): string {
  const dir = m.vs_same_weekday_avg_pct == null ? '' :
    m.vs_same_weekday_avg_pct >= 0 ? ` (+${m.vs_same_weekday_avg_pct}% vs recent ${m.day_of_week}s)` : ` (${m.vs_same_weekday_avg_pct}% vs recent ${m.day_of_week}s)`
  const top = m.top_products.length ? ` Top seller: ${m.top_products[0].product} (${m.top_products[0].quantity}).` : ''
  return `${m.day_of_week} ${fmtDate(m.subject_date)}: ${money(m.gross_sales)} gross from ${m.order_count} orders, AOV ${money(m.aov)}${dir}.${top}`
}

async function narrate(m: Metrics, priceAlerts: PriceChange[]): Promise<{ narrative: string; model: string | null }> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { narrative: fallbackNarrative(m), model: null }
  const model = 'gpt-4.1-mini'
  const system = `You are Cafe Ops AI writing the cafe owner's short morning brief about the most recent trading day at a Brisbane cafe.
Write 3-5 short sentences, warm but factual, no greeting, no sign-off, no headings.
Lead with the day, date and gross sales. Compare fairly: this cafe is much busier on weekends, so judge the day against recent days of the SAME weekday, not the overall average. Call out anything notable (a clear beat/miss, the standout product, how the week is tracking). Do NOT state that weekends are busier than weekdays or that weekday trade is slower — that is normal and well understood, so it adds nothing. End with ONE concrete, practical prep or action tip for the upcoming days.
If "Notable supplier price changes" are provided, add one short sentence flagging the single most important one (name the ingredient, the % move and direction, and the supplier). If none are provided, do not mention costs.
Format dates as DD/MM/YY and money with a $ prefix (AUD). Use ONLY the numbers provided; never invent figures.`
  const priceBlock = priceAlerts.length
    ? `\n\nNotable supplier price changes (most significant first):\n${JSON.stringify(priceAlerts, null, 2)}`
    : ''
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Metrics for the brief:\n${JSON.stringify(m, null, 2)}${priceBlock}` },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!resp.ok) return { narrative: fallbackNarrative(m), model: null }
    const out = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const text = out?.choices?.[0]?.message?.content?.trim()
    return text ? { narrative: text, model } : { narrative: fallbackNarrative(m), model: null }
  } catch {
    return { narrative: fallbackNarrative(m), model: null }
  }
}

/**
 * Generate (and persist) the brief for the most recent business day.
 * Returns null only when there is no sales data at all.
 */
export async function generateBrief(supabase: SupabaseClient): Promise<DailyBriefRow | null> {
  const { data: days, error: daysError } = await supabase
    .from('sales_business_day')
    .select('business_date,gross_sales,net_sales,order_count,aov')
    .order('business_date', { ascending: false })
    .limit(70)
  if (daysError) throw new Error(`daily brief sales lookup failed: ${daysError.message}`)
  if (!days || days.length === 0) return null

  const subjectDate = (days as Day[])[0].business_date
  const { data: claimed, error: claimError } = await supabase.rpc('claim_daily_brief', { p_brief_date: subjectDate })
  if (claimError) throw new Error(`daily brief claim failed: ${claimError.message}`)
  if (!claimed) {
    const { data: existing } = await supabase
      .from('daily_brief')
      .select(BRIEF_SELECT)
      .eq('brief_date', subjectDate)
      .eq('generation_status', 'completed')
      .maybeSingle()
    return existing as DailyBriefRow | null
  }

  try {
    const { data: products, error: productsError } = await supabase
    .from('sales_by_product')
    .select('product,quantity,sale_amount')
    .eq('business_date', subjectDate)
    .order('position', { ascending: true })
    if (productsError) throw new Error(`daily brief products lookup failed: ${productsError.message}`)

    const metrics = computeMetrics(days as Day[], (products as ProductRow[]) ?? [])

    // Supplier price-watch is a bonus signal — never let it break the brief.
    let priceAlerts: PriceChange[] = []
    try {
      priceAlerts = await getPriceWatch(supabase, { limit: 5 })
    } catch (e) {
      console.error('price-watch in brief failed:', e instanceof Error ? e.message : e)
    }

    const { narrative, model } = await narrate(metrics, priceAlerts)

    const row: DailyBriefRow = {
      brief_date: subjectDate,
      generated_at: new Date().toISOString(),
      metrics: { ...metrics, price_alerts: priceAlerts },
      narrative,
      model,
      generation_status: 'completed',
    }

    const { error } = await supabase
      .from('daily_brief')
      .update({ ...row, generation_started_at: null })
      .eq('brief_date', subjectDate)
    if (error) throw new Error(`daily_brief update failed: ${error.message}`)
    return row
  } catch (e) {
    await supabase
      .from('daily_brief')
      .update({ generation_status: 'failed', generation_started_at: null })
      .eq('brief_date', subjectDate)
    throw e
  }
}

/**
 * Return the brief for the latest business day. Generation is cron-owned so a
 * dashboard GET can never trigger paid work. If the cron has not completed for
 * the newest sales date yet, reuse the most recent completed brief instead of
 * making the dashboard card disappear.
 */
export async function getLatestBrief(supabase: SupabaseClient): Promise<DailyBriefRow | null> {
  const { data: latest } = await supabase
    .from('sales_business_day')
    .select('business_date')
    .order('business_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!latest) return null

  const { data: existing } = await supabase
    .from('daily_brief')
    .select(BRIEF_SELECT)
    .lte('brief_date', latest.business_date)
    .eq('generation_status', 'completed')
    .order('brief_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) return existing as DailyBriefRow

  return null
}
