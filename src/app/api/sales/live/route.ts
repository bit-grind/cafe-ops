import { NextResponse } from 'next/server'
import { adminClient, getSessionUser } from '@/lib/adminAuth'

const DAY_SELECT = 'business_date,gross_sales,net_sales,tax,discounts,refunds,order_count,aov,updated_at'
const HOURS_SELECT = 'business_date,hour,gross_sales,net_sales,tax,order_count,aov,updated_at'

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
  const supabase = adminClient()
  const { data, error } = await supabase
    .from('sales_business_day')
    .select(DAY_SELECT)
    .eq('business_date', businessDate)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to load live sales data' }, { status: 500 })

  const { data: hours, error: hoursError } = await supabase
    .from('sales_by_hour')
    .select(HOURS_SELECT)
    .eq('business_date', businessDate)
    .order('hour', { ascending: true })
  if (hoursError) console.error('Hourly sales lookup failed:', hoursError.message)

  return NextResponse.json({
    business_date: businessDate,
    day: data ?? null,
    hours: hoursError ? [] : hours ?? [],
    fetched_at: new Date().toISOString(),
  })
}
