import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'
import { getLatestBrief } from '@/lib/brief'

/**
 * Returns the latest daily brief for any authenticated user (read-only sales
 * narrative — fine for guest and kitchen roles too). Generates on demand if the
 * cron hasn't produced today's yet.
 */
export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const brief = await getLatestBrief(adminClient())
    return NextResponse.json({ brief })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
