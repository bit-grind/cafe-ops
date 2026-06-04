import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { generateBriefIfLatestSalesDay } from '@/lib/brief'
import { consumeImportNonce, verifySignedImport } from '@/lib/serverAuth'
import { parseProductImport } from '@/lib/importValidation'

export const maxDuration = 60

/**
 * Bulk-import product-level sales rows into sales_by_product. Mirrors
 * /api/import-daily: timestamped HMAC auth and replay protection. Each accepted
 * request transactionally replaces one business day's rows. When the imported
 * day is the newest sales day, this also pre-generates the dashboard brief now
 * that both summary and product-level sales data are available.
 * Used by the Kounta sync job (see /kounta-sync).
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    if (rawBody.length > 1_000_000) return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 })
    const signed = verifySignedImport(req, rawBody)
    if (signed instanceof NextResponse) return signed
    if (!await consumeImportNonce(signed.nonce)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { businessDate, rows } = parseProductImport(JSON.parse(rawBody))
    const supabase = adminClient()

    const { data: count, error } = await supabase.rpc('replace_sales_by_product', {
      p_business_date: businessDate,
      p_rows: rows,
    })

    if (error) throw error

    let briefDate: string | null = null
    try {
      const brief = await generateBriefIfLatestSalesDay(supabase, businessDate)
      briefDate = brief?.brief_date ?? null
    } catch (briefError) {
      console.error('Daily brief generation after product import failed:', briefError)
    }

    return NextResponse.json({ ok: true, count: Number(count ?? 0), brief_date: briefDate })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    const isInputError = message.includes('must') || message.includes('Too many') || message.includes('Duplicate') || message.includes('Empty')
    if (!isInputError) console.error('Product sales import failed:', e)
    return NextResponse.json({ ok: false, error: isInputError ? message : 'Import failed' }, { status: isInputError ? 400 : 500 })
  }
}
