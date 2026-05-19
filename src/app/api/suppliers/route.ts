import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/adminAuth'
import { getKitchenSuppliers } from '@/lib/suppliers-db'
import { isOrganizationsEnabled } from '@/lib/tenant'

/**
 * GET /api/suppliers
 *
 * The admin-managed kitchen supplier list. Open to any authenticated
 * user — the Suppliers page is available to admin, guest, and kitchen
 * roles, and all of them need the list to render supplier chips.
 */
export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const suppliers = await getKitchenSuppliers(
    isOrganizationsEnabled() ? session.tenant?.organizationId : null
  )
  return NextResponse.json({ suppliers })
}
