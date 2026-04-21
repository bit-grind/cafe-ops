import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { extractLinesFromInvoice } from '@/lib/extractLines'
import { listBills } from '@/lib/xero'
import type { SupabaseClient } from '@supabase/supabase-js'

export const maxDuration = 60

// ── Xero rate limits (Apr 2026) ───────────────────────────────────────────────
// Per-connection limits:
//   • 60 calls/minute
//   • 1,000 calls/day (NOT 5,000 — ask me how I learned)
// Each extraction makes 2 Xero calls (listAttachments + fetchAttachment).
// At MAX_PER_RUN=2 every 15 min the cron uses 16 calls/hour = 384/day.
// That leaves plenty of headroom for UI loads and manual actions.

const TIME_BUDGET_MS = 45_000
const MAX_PER_RUN = 2
const CACHE_TTL_MS = 60 * 60 * 1000

const RECENT_DAYS = 14

type Candidate = {
  xero_invoice_id: string
  contact_name: string
  invoice_number: string | null
  invoice_date: string
}

export async function GET(req: Request) { return handleCron(req) }
export async function POST(req: Request) { return handleCron(req) }

async function handleCron(req: Request) {
  const start = Date.now()
  try {
    const authError = checkCronAuth(req)
    if (authError) return authError

    const supabase = adminClient()

    // Refresh the bill cache if it's stale. Skip gracefully on Xero 429.
    const cacheAge = await getCacheAgeMs(supabase)
    if (cacheAge > CACHE_TTL_MS) {
      const refreshResult = await tryRefreshCache(supabase)
      if (refreshResult === 'rate_limited') {
        return NextResponse.json({
          skipped: 'rate_limited',
          elapsed: elapsedSec(start),
        })
      }
    }

    const candidates = await pickCandidates(supabase, MAX_PER_RUN)
    if (candidates.length === 0) {
      return NextResponse.json({ processed: 0, message: 'All done' })
    }

    let processed = 0
    let failed = 0
    let rateLimited = false

    for (const c of candidates) {
      if (Date.now() - start > TIME_BUDGET_MS) break
      if (rateLimited) break

      const outcome = await processOne(supabase, c)
      if (outcome === 'processed') processed++
      else if (outcome === 'rate_limited') { failed++; rateLimited = true }
      else failed++
    }

    return NextResponse.json({
      processed, failed, rateLimited,
      cacheAgeHours: cacheAge === Infinity ? null : Math.round(cacheAge / 3600000),
      elapsed: elapsedSec(start),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg, elapsed: elapsedSec(start) }, { status: 500 })
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function checkCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const provided =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace('Bearer ', '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// ── Candidate selection ───────────────────────────────────────────────────────

/**
 * Two-tier queue:
 *   1. Any unprocessed bill within the last 14 days (newest first).
 *   2. Otherwise, the oldest unprocessed bill (drains historical backfills).
 */
async function pickCandidates(
  supabase: SupabaseClient,
  limit: number
): Promise<Candidate[]> {
  const doneSet = await getDoneInvoiceIds(supabase)

  const recentCutoff = new Date()
  recentCutoff.setDate(recentCutoff.getDate() - RECENT_DAYS)
  const cutoffIso = recentCutoff.toISOString().slice(0, 10)

  const { data: recent } = await supabase
    .from('xero_bill_cache')
    .select('xero_invoice_id, contact_name, invoice_number, invoice_date')
    .eq('has_attachments', true)
    .gte('invoice_date', cutoffIso)
    .order('invoice_date', { ascending: false })
    .limit(200)

  const fromRecent = (recent ?? [])
    .filter((c) => !doneSet.has(c.xero_invoice_id))
    .slice(0, limit)
  if (fromRecent.length > 0) return fromRecent

  const { data: historical } = await supabase
    .from('xero_bill_cache')
    .select('xero_invoice_id, contact_name, invoice_number, invoice_date')
    .eq('has_attachments', true)
    .order('invoice_date', { ascending: true })
    .limit(2000)

  return (historical ?? [])
    .filter((c) => !doneSet.has(c.xero_invoice_id))
    .slice(0, limit)
}

async function getDoneInvoiceIds(supabase: SupabaseClient): Promise<Set<string>> {
  // Supabase defaults to 1,000 rows per query — filter server-side and
  // explicitly raise the limit so we never silently miss rows as the
  // extraction_runs table grows past 1k.
  const { data } = await supabase
    .from('extraction_runs')
    .select('xero_invoice_id')
    .in('status', ['completed', 'processing'])
    .limit(50_000)
  return new Set((data ?? []).map((r) => r.xero_invoice_id))
}

// ── Processing a single invoice ───────────────────────────────────────────────

type Outcome = 'processed' | 'failed' | 'rate_limited'

async function processOne(supabase: SupabaseClient, c: Candidate): Promise<Outcome> {
  const { data: run } = await supabase
    .from('extraction_runs')
    .upsert(
      {
        xero_invoice_id: c.xero_invoice_id,
        supplier_name: c.contact_name,
        invoice_number: c.invoice_number,
        invoice_date: c.invoice_date,
        status: 'processing',
        created_at: new Date().toISOString(),
      },
      { onConflict: 'xero_invoice_id' }
    )
    .select('id')
    .single()

  if (!run) return 'failed'

  try {
    const result = await extractLinesFromInvoice(c.xero_invoice_id)

    await supabase
      .from('extraction_runs')
      .update({
        attachment_name: result.attachmentName,
        status: 'completed',
        model_used: result.model,
        raw_response: result.rawResponse,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id)

    if (result.items.length > 0) {
      await supabase.from('extracted_line_items').delete().eq('run_id', run.id)
      await supabase.from('extracted_line_items').insert(
        result.items.map((item) => ({
          run_id: run.id,
          xero_invoice_id: c.xero_invoice_id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total: item.total,
          category: item.category,
        }))
      )
    }
    return 'processed'
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    await supabase
      .from('extraction_runs')
      .update({ status: 'failed', error_message: msg })
      .eq('id', run.id)
    return msg.includes('429') ? 'rate_limited' : 'failed'
  }
}

// ── Cache refresh ─────────────────────────────────────────────────────────────

async function getCacheAgeMs(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('xero_bill_cache')
    .select('last_synced_at')
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.last_synced_at) return Infinity
  return Date.now() - new Date(data.last_synced_at).getTime()
}

/**
 * Refresh the most recent pages of bills from Xero. Costs up to 5 Xero calls.
 * Only used to pull in new bills — historical backfills use /refresh-cache.
 * Returns 'rate_limited' if Xero 429s, 'ok' otherwise.
 */
async function tryRefreshCache(
  supabase: SupabaseClient
): Promise<'ok' | 'rate_limited'> {
  try {
    const allBills: Awaited<ReturnType<typeof listBills>> = []
    for (let page = 1; page <= 5; page++) {
      const bills = await listBills({ page })
      if (bills.length === 0) break
      allBills.push(...bills)
      if (bills.length < 100) break
    }
    if (allBills.length === 0) return 'ok'

    const now = new Date().toISOString()
    await supabase.from('xero_bill_cache').upsert(
      allBills.map((b) => ({
        xero_invoice_id: b.invoiceID,
        contact_name: b.contactName,
        invoice_number: b.invoiceNumber,
        invoice_date: b.date,
        has_attachments: b.hasAttachments,
        total: b.total,
        amount_due: b.amountDue,
        amount_paid: b.amountPaid,
        currency_code: b.currencyCode,
        status: b.status,
        due_date: b.dueDate,
        reference: b.reference,
        last_synced_at: now,
      }))
    )
    return 'ok'
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    if (msg.includes('429')) return 'rate_limited'
    throw e
  }
}

// ── Misc ──────────────────────────────────────────────────────────────────────

function elapsedSec(start: number): string {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`
}
