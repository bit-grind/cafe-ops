import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { consumeImportNonce, verifySignedImport } from '@/lib/serverAuth'
import { parseDailySalesRows } from '@/lib/importValidation'

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    if (rawBody.length > 200_000) return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 })
    const signed = verifySignedImport(req, rawBody)
    if (signed instanceof NextResponse) return signed
    if (!await consumeImportNonce(signed.nonce)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const rows = parseDailySalesRows(JSON.parse(rawBody))

    const { error } = await supabase
      .from('sales_business_day')
      .upsert(rows, { onConflict: 'business_date' })

    if (error) throw error

    return NextResponse.json({ ok: true, count: rows.length })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    const isInputError = message.includes('must') || message.includes('Too many') || message.includes('Duplicate')
    if (!isInputError) console.error('Daily sales import failed:', e)
    return NextResponse.json({ ok: false, error: isInputError ? message : 'Import failed' }, { status: isInputError ? 400 : 500 })
  }
}
