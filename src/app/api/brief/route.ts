import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'
import { internalError } from '@/lib/apiError'
import { getBriefByDate, getBriefDates, getLatestBrief } from '@/lib/brief'

const HOURS_SELECT = 'business_date,hour,gross_sales,net_sales,tax,order_count,aov,updated_at'

/**
 * Returns the latest daily brief for any authenticated user (read-only sales
 * narrative. Generation is cron-owned so this GET route stays read-only.
 */
export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.isTeam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (session.isGuest) return NextResponse.json({ brief: null, dates: [] })
  try {
    const url = new URL(req.url)
    const date = url.searchParams.get('date')
    const supabase = adminClient()
    const [brief, dates] = await Promise.all([
      date ? getBriefByDate(supabase, date) : getLatestBrief(supabase),
      getBriefDates(supabase),
    ])
    const { data: hours, error: hoursError } = brief
      ? await supabase
          .from('sales_by_hour')
          .select(HOURS_SELECT)
          .eq('business_date', brief.brief_date)
          .order('hour', { ascending: true })
      : { data: [], error: null }
    if (hoursError) console.error('Brief hourly sales lookup failed:', hoursError.message)

    return NextResponse.json({ brief, dates, hours: hoursError ? [] : hours ?? [] })
  } catch (e: unknown) {
    return internalError('Brief load failed', e, 'Failed to load brief')
  }
}
