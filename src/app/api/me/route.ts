import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/adminAuth'

/**
 * GET /api/me — returns the current user's identity plus an `isAdmin` flag
 * computed server-side. This keeps the admin email out of client JavaScript
 * (which we would expose if we used a NEXT_PUBLIC env var).
 *
 * Response shape:
 *   { email: string | null, isAdmin: boolean, isGuest: boolean }
 *
 * Requires an Authorization header carrying the Supabase access token.
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
  const isGuest =
    user.user_metadata?.role === 'guest' || email === 'guest@example.com'

  return NextResponse.json({
    email,
    isAdmin: isAdminEmail(email),
    isGuest,
  })
}
