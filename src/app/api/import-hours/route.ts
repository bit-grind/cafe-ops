import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { consumeImportNonce, verifySignedImport } from '@/lib/serverAuth'
import { parseHourlyImport } from '@/lib/importValidation'

/**
 * Replaces one business day's real hourly sales buckets from Kounta's
 * salesummarybyhour export.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    if (rawBody.length > 100_000) return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 })
    const signed = verifySignedImport(req, rawBody)
    if (signed instanceof NextResponse) return signed
    if (!await consumeImportNonce(signed.nonce)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { businessDate, rows } = parseHourlyImport(JSON.parse(rawBody))
    const supabase = adminClient()

    const { data: count, error } = await supabase.rpc('replace_sales_by_hour', {
      p_business_date: businessDate,
      p_rows: rows,
    })

    if (error) throw error

    return NextResponse.json({ ok: true, count: Number(count ?? 0) })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    const isInputError = message.includes('must') || message.includes('Too many') || message.includes('Duplicate') || message.includes('Empty')
    if (!isInputError) console.error('Hourly sales import failed:', e)
    return NextResponse.json({ ok: false, error: isInputError ? message : 'Import failed' }, { status: isInputError ? 400 : 500 })
  }
}
