import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'
import { getPriceWatch } from '@/lib/priceWatch'

/**
 * GET /api/price-watch — significant recent supplier price changes, derived from
 * AI-extracted invoice line items. Available to any authenticated user.
 */
export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const changes = await getPriceWatch(adminClient())
    return NextResponse.json({ changes })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
