import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/adminAuth'

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
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = user.email ?? null
  const role = (user.user_metadata?.role as string) ?? null
  const isAdmin = isAdminEmail(email)
  const isGuest = role === 'guest' || email === 'guest@example.com'
  const isKitchen = role === 'kitchen'

  // Determine which header tabs the user may see.
  let allowedTabs: string[]
  if (isKitchen) {
    allowedTabs = ['kitchen', 'bills']
  } else if (isAdmin) {
    allowedTabs = ['dashboard', 'kitchen', 'ask', 'bills', 'admin']
  } else {
    // Regular users and guests see everything except admin.
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
