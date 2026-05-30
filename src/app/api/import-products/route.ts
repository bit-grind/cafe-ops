import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Bulk-import product-level sales rows into sales_by_product. Mirrors
 * /api/import-daily: shared-secret auth, upsert keyed on (business_date, product).
 * Used by the Kounta sync job (see /kounta-sync).
 */
export async function POST(req: Request) {
  try {
    const expected = process.env.IMPORT_SECRET
    if (!expected) {
      return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 })
    }
    if (req.headers.get('x-import-secret') !== expected) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rows = await req.json()
    if (!Array.isArray(rows)) {
      return NextResponse.json({ ok: false, error: 'Body must be an array' }, { status: 400 })
    }
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, count: 0 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { error } = await supabase
      .from('sales_by_product')
      .upsert(rows, { onConflict: 'business_date,product' })

    if (error) throw error

    return NextResponse.json({ ok: true, count: rows.length })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
