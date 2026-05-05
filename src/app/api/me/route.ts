import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/adminAuth'
import { getAllowedTabs } from '@/lib/permissions'

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

  const allowedTabs = getAllowedTabs({ isAdmin, isGuest, isKitchen })

  return NextResponse.json({
    email,
    role,
    isAdmin,
    isGuest,
    isKitchen,
    allowedTabs,
  })
}
