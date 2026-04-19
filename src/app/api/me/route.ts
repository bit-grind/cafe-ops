import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/adminAuth'

/**
 * GET /api/me — returns the current user's identity, role, and permission
 * flags. Keeps the admin email out of client JavaScript.
 *
 * Response shape:
 *   { email, role, isAdmin, isGuest, isKitchen, allowedTabs }
 *
 * `allowedTabs` lists the tab keys the user should see in the header.
 */
export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, role, isAdmin, isGuest, isKitchen } = session

  // Determine which header tabs the user may see. Guests don't see
  // supplier-cost surfaces (kitchen dashboard, bills totals drill-down).
  let allowedTabs: string[]
  if (isKitchen) {
    allowedTabs = ['kitchen', 'bills']
  } else if (isAdmin) {
    allowedTabs = ['dashboard', 'kitchen', 'ask', 'bills', 'admin']
  } else if (isGuest) {
    allowedTabs = ['dashboard', 'ask', 'bills']
  } else {
    allowedTabs = ['dashboard', 'kitchen', 'ask', 'bills']
  }

  return NextResponse.json({
    email,
    role,
    isAdmin,
    isGuest,
    isKitchen,
    allowedTabs,
  })
}
