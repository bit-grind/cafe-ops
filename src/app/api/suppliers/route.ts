import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/adminAuth'
import { getKitchenSuppliers } from '@/lib/suppliers-db'

/**
 * GET /api/suppliers
 *
 * The admin-managed kitchen supplier list. Open to any authenticated
 * non-guest user. Supplier data is intentionally hidden from guest accounts.
 */
export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const suppliers = await getKitchenSuppliers()
  return NextResponse.json({ suppliers })
}
