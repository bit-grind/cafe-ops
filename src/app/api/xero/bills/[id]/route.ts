import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/adminAuth'
import { internalError } from '@/lib/apiError'
import { getBill, getXeroConnection } from '@/lib/xero'

/**
 * GET /api/xero/bills/:id — fetch a single supplier bill (ACCPAY invoice)
 * with full line-item detail from Xero.
 *
 * Auth: logged-in non-guest users.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const conn = await getXeroConnection()
    if (!conn) return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const bill = await getBill(id)
    if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

    return NextResponse.json({ bill })
  } catch (e: unknown) {
    return internalError('Bill fetch failed', e, 'Failed to load bill')
  }
}
