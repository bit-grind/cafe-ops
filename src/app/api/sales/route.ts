import { NextResponse } from 'next/server'
import { adminClient, getSessionUser } from '@/lib/adminAuth'

const SALES_SELECT = 'business_date,gross_sales,net_sales,tax,discounts,refunds,order_count,aov,updated_at'

export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.isTeam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const requested = Number.parseInt(url.searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 365) : 90
  const { data, error } = await adminClient()
    .from('sales_business_day')
    .select(SALES_SELECT)
    .order('business_date', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: 'Failed to load sales data' }, { status: 500 })
  return NextResponse.json({ days: data ?? [] })
}
