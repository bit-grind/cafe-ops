import { NextResponse } from 'next/server'
import { getServerBranding } from '@/lib/brandingServer'
import { isDefaultBranding } from '@/lib/branding'

export const dynamic = 'force-dynamic'

export async function GET() {
  const branding = await getServerBranding()
  // Only cache real branding. A fallback (default) response means the storage
  // read transiently failed; caching it publicly pins the generic brand at the
  // CDN for minutes/hours. no-store lets the very next request self-heal.
  const cacheControl = isDefaultBranding(branding)
    ? 'no-store'
    : 'public, max-age=300, stale-while-revalidate=86400'
  return NextResponse.json(branding, { headers: { 'Cache-Control': cacheControl } })
}
