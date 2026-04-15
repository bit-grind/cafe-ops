import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getBill, getXeroConnection } from '@/lib/xero'

/**
 * GET /api/xero/bills/:id — fetch a single supplier bill (ACCPAY invoice)
 * with full line-item detail from Xero.
 *
 * Auth: any logged-in user (guests included — bills are read-only data).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const { data: { user } } = await anonClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const conn = await getXeroConnection()
    if (!conn) return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const bill = await getBill(id)
    if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

    return NextResponse.json({ bill })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
