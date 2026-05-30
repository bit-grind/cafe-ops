import { NextResponse } from 'next/server'
import { completeXeroAuth, xeroRedirectUri } from '@/lib/xero'
import { secureCompare } from '@/lib/serverAuth'

/**
 * Xero redirects the browser here after the user consents. We verify the
 * state cookie, exchange the code for tokens, look up the tenant, store
 * everything, then bounce the user back to /ops/bills.
 *
 * Note: this endpoint is NOT gated by requireAdmin — Xero's redirect is a
 * top-level browser navigation and can't carry our Supabase JWT. The state
 * cookie we set in /api/xero/connect (which IS admin-gated) is the proof
 * that this callback was initiated by an admin in this same browser session.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  let origin: string
  try {
    origin = new URL(process.env.APP_ORIGIN ?? xeroRedirectUri()).origin
  } catch {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }
  const redirectBack = (err?: string) => {
    const target = new URL('/ops/bills', origin)
    if (err) target.searchParams.set('xero_error', err)
    else target.searchParams.set('xero_connected', '1')
    const res = NextResponse.redirect(target.toString(), { status: 302 })
    res.cookies.set('xero_oauth_state', '', { path: '/', maxAge: 0 })
    return res
  }

  if (error) return redirectBack(`xero_denied_${error}`)
  if (!code) return redirectBack('missing_code')

  const rawCookieState = req.headers.get('cookie')?.match(/xero_oauth_state=([^;]+)/)?.[1]
  const cookieState = rawCookieState ? decodeURIComponent(rawCookieState) : null
  if (!cookieState || !state || !secureCompare(cookieState, state)) {
    return redirectBack('state_mismatch')
  }

  try {
    await completeXeroAuth(code)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Xero callback failed:', msg)
    return redirectBack('exchange_failed')
  }

  return redirectBack()
}
