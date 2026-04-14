import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    // Require a shared secret for imports (set IMPORT_SECRET in Vercel env)
    const expected = process.env.IMPORT_SECRET
    if (!expected) {
      return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 })
    }
    const provided = req.headers.get('x-import-secret')
    if (provided !== expected) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const rows = await req.json()

    if (!Array.isArray(rows)) {
      return NextResponse.json({ ok: false, error: 'Body must be an array' }, { status: 400 })
    }

    const { error } = await supabase
      .from('sales_business_day')
      .upsert(rows, { onConflict: 'business_date' })

    if (error) throw error

    return NextResponse.json({ ok: true, count: rows.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
