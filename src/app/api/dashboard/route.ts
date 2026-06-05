import { NextResponse } from 'next/server'
import { adminClient, getSessionUser } from '@/lib/adminAuth'
import { getAllowedTabs } from '@/lib/permissions'

const SALES_SELECT = 'business_date,gross_sales,net_sales,tax,discounts,refunds,order_count,aov,updated_at'

function brisbaneTodayISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Brisbane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}

export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const liveBusinessDate = brisbaneTodayISO()
  const profile = {
    email: session.email,
    role: session.role,
    isAdmin: session.isAdmin,
    isGuest: session.isGuest,
    isKitchen: session.isKitchen,
    allowedTabs: getAllowedTabs(session),
  }

  if (session.isKitchen) {
    return NextResponse.json({
      profile,
      days: [],
      live_business_date: liveBusinessDate,
      fetched_at: new Date().toISOString(),
    })
  }

  const url = new URL(req.url)
  const requested = Number.parseInt(url.searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 365) : 90

  const { data, error } = await adminClient()
    .from('sales_business_day')
    .select(SALES_SELECT)
    .order('business_date', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 })

  return NextResponse.json({
    profile,
    days: data ?? [],
    live_business_date: liveBusinessDate,
    fetched_at: new Date().toISOString(),
  })
}
