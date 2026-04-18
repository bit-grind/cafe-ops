import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  // Only intercept /ops and /ops/ask routes
  if (
    !request.nextUrl.pathname.startsWith('/ops') ||
    request.nextUrl.pathname.startsWith('/ops/bills') ||
    request.nextUrl.pathname.startsWith('/ops/admin') ||
    request.nextUrl.pathname.startsWith('/ops/kitchen')
  ) {
    return NextResponse.next()
  }

  // Get the session token
  const token = request.cookies.get('sb-access-token')?.value
  if (!token) {
    // No session, let it through (login page will handle redirect)
    return NextResponse.next()
  }

  try {
    // Check if user is kitchen
    const meRes = await fetch(`${request.nextUrl.origin}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (meRes.ok) {
      const me = await meRes.json()
      if (me.isKitchen) {
        // Redirect kitchen users to bills page
        return NextResponse.redirect(new URL('/ops/kitchen', request.url))
      }
    }
  } catch {
    // If the API call fails, let it through (user will be handled client-side)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/ops/:path*'],
}
