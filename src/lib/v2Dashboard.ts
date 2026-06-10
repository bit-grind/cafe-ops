export type DashboardDay = {
  business_date: string
  gross_sales: number
  net_sales: number
  tax: number
  discounts: number
  refunds: number
  order_count: number
  aov: number
  updated_at?: string
}

export type DashboardHour = {
  business_date: string
  hour: number
  gross_sales: number
  net_sales: number
  tax: number
  order_count: number
  aov: number
  updated_at?: string
}

export type DashboardMetrics = {
  latestDay: DashboardDay
  liveDay: DashboardDay | null
  liveBusinessDate: string
  liveVsTypicalPct: number | null
  wtdSales: number
  wowPct: number | null
  wtdFrom: string
  weekTo: string
  wtdSeries: number[]
  lastWeekSales: number
  lastWeekOrders: number
  lastWeekFrom: string
  lastWeekTo: string
  lastWeekSeries: number[]
  mtdSales: number
  mtdFrom: string
  mtdSeries: number[]
  lastMonthSales: number
  lastMonthFrom: string
  lastMonthTo: string
  momPct: number | null
}

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00Z`)
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(value: string, days: number) {
  const date = parseIsoDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatIsoDate(date)
}

function mondayFor(value: string) {
  const date = parseIsoDate(value)
  const weekday = date.getUTCDay()
  return addUtcDays(value, weekday === 0 ? -6 : 1 - weekday)
}

function totalSales(days: DashboardDay[]) {
  return days.reduce((sum, day) => sum + Number(day.gross_sales || 0), 0)
}

function totalOrders(days: DashboardDay[]) {
  return days.reduce((sum, day) => sum + Number(day.order_count || 0), 0)
}

function sortedSales(days: DashboardDay[]) {
  return [...days]
    .sort((a, b) => a.business_date.localeCompare(b.business_date))
    .map(day => Number(day.gross_sales || 0))
}

function percentageChange(current: number, previous: number) {
  return previous > 0 ? ((current - previous) / previous) * 100 : null
}

export function computeDashboardMetrics(
  days: DashboardDay[],
  liveBusinessDate?: string | null,
): DashboardMetrics | null {
  if (days.length === 0) return null

  const sortedDays = [...days].sort((a, b) => b.business_date.localeCompare(a.business_date))
  const latestDay = sortedDays[0]
  const liveDate = liveBusinessDate ?? latestDay.business_date
  const liveDay = sortedDays.find(day => day.business_date === liveDate) ?? null
  const anchorDate = liveDate

  const weekFrom = mondayFor(anchorDate)
  const weekTo = addUtcDays(weekFrom, 6)
  const previousWeekFrom = addUtcDays(weekFrom, -7)
  const previousWeekTo = addUtcDays(weekFrom, -1)
  const previousEquivalentDate = addUtcDays(anchorDate, -7)

  const weekToDate = sortedDays.filter(day =>
    day.business_date >= weekFrom && day.business_date <= anchorDate)
  const previousWeekSameDays = sortedDays.filter(day =>
    day.business_date >= previousWeekFrom && day.business_date <= previousEquivalentDate)
  const previousWeek = sortedDays.filter(day =>
    day.business_date >= previousWeekFrom && day.business_date <= previousWeekTo)

  const anchor = parseIsoDate(anchorDate)
  const monthFrom = `${anchorDate.slice(0, 8)}01`
  const previousMonthEnd = addUtcDays(monthFrom, -1)
  const previousMonthFrom = `${previousMonthEnd.slice(0, 8)}01`
  const currentMonth = sortedDays.filter(day =>
    day.business_date >= monthFrom && day.business_date <= anchorDate)
  const previousMonth = sortedDays.filter(day =>
    day.business_date >= previousMonthFrom && day.business_date <= previousMonthEnd)

  const wtdSales = totalSales(weekToDate)
  const previousWtdSales = totalSales(previousWeekSameDays)
  const mtdSales = totalSales(currentMonth)
  const lastMonthSales = totalSales(previousMonth)

  const anchorWeekday = anchor.getUTCDay()
  const comparableDays = sortedDays
    .filter(day => day.business_date < anchorDate && parseIsoDate(day.business_date).getUTCDay() === anchorWeekday)
    .slice(0, 6)
  const typicalSales = comparableDays.length > 0
    ? totalSales(comparableDays) / comparableDays.length
    : 0

  return {
    latestDay,
    liveDay,
    liveBusinessDate: liveDate,
    liveVsTypicalPct: liveDay ? percentageChange(Number(liveDay.gross_sales || 0), typicalSales) : null,
    wtdSales,
    wowPct: percentageChange(wtdSales, previousWtdSales),
    wtdFrom: weekFrom,
    weekTo,
    wtdSeries: sortedSales(weekToDate),
    lastWeekSales: totalSales(previousWeek),
    lastWeekOrders: totalOrders(previousWeek),
    lastWeekFrom: previousWeekFrom,
    lastWeekTo: previousWeekTo,
    lastWeekSeries: sortedSales(previousWeek),
    mtdSales,
    mtdFrom: monthFrom,
    mtdSeries: sortedSales(currentMonth),
    lastMonthSales,
    lastMonthFrom: previousMonthFrom,
    lastMonthTo: previousMonthEnd,
    momPct: percentageChange(mtdSales, lastMonthSales),
  }
}

export function splitBriefInsights(narrative: string, limit = 3) {
  return narrative
    .trim()
    .split(/\n+|(?<=[.!?])\s+/)
    .map(sentence => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit)
}

export function sparklinePoints(values: number[], width = 180, height = 42) {
  if (values.length === 0) return ''
  if (values.length === 1) return `0,${height / 2} ${width},${height / 2}`

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 1)

  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - 4 - ((value - min) / range) * (height - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}
