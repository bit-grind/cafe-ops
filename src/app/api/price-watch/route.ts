import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'
import { internalError } from '@/lib/apiError'
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
    return internalError('Price watch failed', e, 'Failed to load price changes')
  }
}
