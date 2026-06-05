import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'
import { getBriefByDate, getBriefDates, getLatestBrief } from '@/lib/brief'

/**
 * Returns the latest daily brief for any authenticated user (read-only sales
 * narrative. Generation is cron-owned so this GET route stays read-only.
 */
export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.isGuest) return NextResponse.json({ brief: null, dates: [] })
  try {
    const url = new URL(req.url)
    const date = url.searchParams.get('date')
    const supabase = adminClient()
    const [brief, dates] = await Promise.all([
      date ? getBriefByDate(supabase, date) : getLatestBrief(supabase),
      getBriefDates(supabase),
    ])

    return NextResponse.json({ brief, dates })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
