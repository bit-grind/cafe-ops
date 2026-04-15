import { NextResponse } from 'next/server'
import { completeXeroAuth } from '@/lib/xero'

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

  const origin = url.origin
  const redirectBack = (err?: string) => {
    const target = new URL('/ops/bills', origin)
    if (err) target.searchParams.set('xero_error', err)
    else target.searchParams.set('xero_connected', '1')
    return NextResponse.redirect(target.toString(), { status: 302 })
  }

  if (error) return redirectBack(`xero_denied_${error}`)
  if (!code) return redirectBack('missing_code')

  const cookieState = req.headers.get('cookie')?.match(/xero_oauth_state=([^;]+)/)?.[1]
  if (!cookieState || cookieState !== state) {
    return redirectBack('state_mismatch')
  }

  try {
    await completeXeroAuth(code)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Xero callback failed:', msg)
    return redirectBack('exchange_failed')
  }

  const res = redirectBack()
  // Clear the one-time state cookie
  res.cookies.set('xero_oauth_state', '', { path: '/', maxAge: 0 })
  return res
}
