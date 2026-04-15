import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { buildAuthorizeUrl } from '@/lib/xero'
import { randomBytes } from 'crypto'

/**
 * Admin-only. Returns a Xero OAuth authorize URL that the client should
 * navigate to (window.location = url). We also set a short-lived
 * `xero_oauth_state` cookie so /api/xero/callback can verify the state.
 *
 * The client calls this with the Supabase access token in the Authorization
 * header. After navigating to Xero and consenting, Xero redirects the browser
 * back to /api/xero/callback.
 */
export async function GET(req: Request) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.response

  const state = randomBytes(16).toString('hex')
  let url: string
  try {
    url = buildAuthorizeUrl(state)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Xero env not configured'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const res = NextResponse.json({ url })
  res.cookies.set('xero_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 min
  })
  return res
}
