import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { getBrandingBucket, getBrandingLogoPath } from '@/lib/brandingServer'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { data, error } = await adminClient()
    .storage
    .from(getBrandingBucket())
    .download(getBrandingLogoPath())

  if (error || !data) {
    return NextResponse.redirect(new URL('/brand/logo.svg', req.url))
  }

  return new Response(data, {
    headers: {
      'Content-Type': data.type || 'image/webp',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    },
  })
}
