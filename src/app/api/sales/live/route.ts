import { NextResponse } from 'next/server'
import { adminClient, getSessionUser } from '@/lib/adminAuth'

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

  const businessDate = brisbaneTodayISO()
  const { data, error } = await adminClient()
    .from('sales_business_day')
    .select('business_date,gross_sales,net_sales,tax,discounts,refunds,order_count,aov,updated_at')
    .eq('business_date', businessDate)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to load live sales data' }, { status: 500 })
  return NextResponse.json({ business_date: businessDate, day: data ?? null, fetched_at: new Date().toISOString() })
}
