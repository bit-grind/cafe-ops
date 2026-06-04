import { NextResponse } from 'next/server'
import { getServerBranding } from '@/lib/brandingServer'

export const dynamic = 'force-dynamic'

export async function GET() {
  const branding = await getServerBranding()
  return NextResponse.json(branding, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
