import type { SupabaseClient } from '@supabase/supabase-js'
import { listBills, getXeroConnection } from '@/lib/xero'
import { fetchBrisbaneWeather } from '@/lib/ask/weather'

/**
 * Tools exposed to the Ask AI agent. The model decides which to call and with
 * what arguments; the executor below runs them against Supabase / Xero / the
 * weather API and returns plain JSON the model reads back.
 *
 * Design notes:
 *  - Every executor returns a serializable object, never throws. On failure it
 *    returns { error } so the model can recover or explain, rather than killing
 *    the whole request.
 *  - Results are capped so a single tool call can't blow the context window.
 */

export type AskToolContext = { supabase: SupabaseClient }

type OpenAITool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

const dateProp = (desc: string) => ({ type: 'string', description: `${desc} as YYYY-MM-DD` })

export const ASK_TOOLS: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'get_daily_sales',
      description:
        'Daily sales totals for each business day in an inclusive date range: gross_sales, net_sales, tax, discounts, refunds, order_count, aov. Use this for trends, day-vs-day comparisons, a specific day, or any period — including ranges older than the recent window already provided in the prompt.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date_from: dateProp('inclusive start date'),
          date_to: dateProp('inclusive end date'),
        },
        required: ['date_from', 'date_to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_products',
      description:
        'Top-selling products aggregated over an inclusive date range, sorted by total quantity sold. Returns product, quantity, sale_amount, cost, gross_profit_pct. Use for "best sellers", "most popular", or product-mix questions over a period.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date_from: dateProp('inclusive start date'),
          date_to: dateProp('inclusive end date'),
          limit: { type: 'integer', description: 'How many top products to return (default 50, max 100)' },
        },
        required: ['date_from', 'date_to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_products_for_date',
      description:
        'All product-level sales rows for a single business day (product, quantity, sale_amount, cost, gross_profit_pct), ordered by the day\'s sales ranking. Use when the question is about one specific date.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { date: dateProp('the business day') },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_purchase_line_items',
      description:
        'Search AI-extracted supplier invoice line items — the actual products bought, read off supplier PDF invoices. Returns description, quantity, unit_price, total, supplier and invoice_date. Use for ingredient/product cost questions, "how much did we pay for X", and detecting price changes over time (compare unit_price across invoice_date).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          terms: {
            type: 'array',
            items: { type: 'string' },
            description: '1-5 keywords to match against the item description, e.g. ["milk"] or ["bega","cheddar"]',
          },
        },
        required: ['terms'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_supplier_bills',
      description:
        'Supplier bills (accounts payable) from Xero within an inclusive date range, optionally narrowed to one supplier. Each bill includes status, total, amountDue, amountPaid, dates and line items (description, quantity, unitAmount, lineAmount). Status AUTHORISED = approved but not fully paid (amountDue > 0 is outstanding); PAID = settled. Use for spend, unpaid/owing bills, and what was bought from a supplier.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date_from: dateProp('inclusive start date'),
          date_to: dateProp('inclusive end date'),
          supplier: { type: 'string', description: 'Optional supplier name to filter by (case-insensitive contains match)' },
        },
        required: ['date_from', 'date_to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description:
        'Historical Brisbane weather for a single date: conditions, max/min temperature °C and rainfall mm. Use when sales on a day may be weather-related.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { date: dateProp('the date') },
        required: ['date'],
      },
    },
  },
]

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const isIso = (s: unknown): s is string => typeof s === 'string' && ISO_RE.test(s)
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

type ExtractionRunRelation = { supplier_name: string | null; invoice_date: string | null }
function pickRun(run: ExtractionRunRelation | ExtractionRunRelation[] | null): ExtractionRunRelation | null {
  if (!run) return null
  return Array.isArray(run) ? (run[0] ?? null) : run
}

/**
 * Run a single tool call. Always resolves to a JSON-serializable value; never
 * throws (errors are returned as { error } so the agent loop keeps going).
 */
export async function executeAskTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AskToolContext,
): Promise<unknown> {
  const { supabase } = ctx
  try {
    switch (name) {
      case 'get_daily_sales': {
        const { date_from, date_to } = args
        if (!isIso(date_from) || !isIso(date_to)) return { error: 'date_from and date_to must be YYYY-MM-DD' }
        const { data, error } = await supabase
          .from('sales_business_day')
          .select('business_date,gross_sales,net_sales,tax,discounts,refunds,order_count,aov')
          .gte('business_date', date_from)
          .lte('business_date', date_to)
          .order('business_date', { ascending: true })
          .limit(400)
        if (error) return { error: error.message }
        return { rows: data ?? [], count: data?.length ?? 0 }
      }

      case 'get_top_products': {
        const { date_from, date_to } = args
        if (!isIso(date_from) || !isIso(date_to)) return { error: 'date_from and date_to must be YYYY-MM-DD' }
        const limit = clamp(Number(args.limit ?? 50) || 50, 1, 100)
        const { data, error } = await supabase.rpc('get_top_products', {
          date_from,
          date_to,
          top_n: limit,
        })
        if (error) return { error: error.message }
        return { rows: data ?? [] }
      }

      case 'get_products_for_date': {
        const { date } = args
        if (!isIso(date)) return { error: 'date must be YYYY-MM-DD' }
        const { data, error } = await supabase
          .from('sales_by_product')
          .select('business_date,position,product,quantity,sale_amount,cost,gross_profit_pct')
          .eq('business_date', date)
          .order('position', { ascending: true })
        if (error) return { error: error.message }
        return { rows: data ?? [], count: data?.length ?? 0 }
      }

      case 'search_purchase_line_items': {
        const terms = Array.isArray(args.terms)
          ? args.terms.map(t => String(t).trim()).filter(Boolean).slice(0, 5)
          : []
        if (terms.length === 0) return { rows: [], note: 'No search terms provided' }
        const pattern = terms.map(t => `%${t}%`)
        let query = supabase
          .from('extracted_line_items')
          .select('description, quantity, unit_price, total, extraction_runs!inner(supplier_name, invoice_date)')
          .limit(80)
        if (pattern.length === 1) {
          query = query.ilike('description', pattern[0])
        } else {
          query = query.or(pattern.map(p => `description.ilike.${p}`).join(','))
        }
        const { data, error } = await query
        if (error) return { error: error.message }
        const rows = (data ?? []).map(r => {
          const run = pickRun(r.extraction_runs as ExtractionRunRelation | ExtractionRunRelation[] | null)
          return {
            description: r.description,
            quantity: r.quantity,
            unit_price: r.unit_price,
            total: r.total,
            supplier: run?.supplier_name ?? null,
            invoice_date: run?.invoice_date ?? null,
          }
        })
        return { rows, count: rows.length }
      }

      case 'get_supplier_bills': {
        const { date_from, date_to } = args
        if (!isIso(date_from) || !isIso(date_to)) return { error: 'date_from and date_to must be YYYY-MM-DD' }
        const conn = await getXeroConnection()
        if (!conn) return { connected: false, note: 'Xero is not connected. An admin needs to connect Xero on the Bills page.' }
        let bills = await listBills({ dateFrom: date_from, dateTo: date_to }, { includeLineItems: true })
        const supplier = typeof args.supplier === 'string' ? args.supplier.trim().toLowerCase() : ''
        if (supplier) bills = bills.filter(b => b.contactName.toLowerCase().includes(supplier))
        if (bills.length > 80) bills = bills.slice(0, 80)
        return { connected: true, tenant: conn.tenant_name, count: bills.length, bills }
      }

      case 'get_weather': {
        const { date } = args
        if (!isIso(date)) return { error: 'date must be YYYY-MM-DD' }
        const w = await fetchBrisbaneWeather(date)
        return w ?? { error: 'No weather data available for that date' }
      }

      default:
        return { error: `Unknown tool: ${name}` }
    }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Tool execution failed' }
  }
}
