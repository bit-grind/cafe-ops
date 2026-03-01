import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Only protect /ops routes
  if (!pathname.startsWith('/ops')) return NextResponse.next()

  // Simple cookie gate: if no Supabase auth cookie, redirect to /login.
  // (We’ll improve this to a stronger server-side session check later.)
  const cookieHeader = req.headers.get('cookie') || ''
  const looksLoggedIn =
    cookieHeader.includes('sb-') && (cookieHeader.includes('access-token') || cookieHeader.includes('auth-token'))

  if (!looksLoggedIn) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/ops/:path*'],
}
