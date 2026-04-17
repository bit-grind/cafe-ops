'use client'

import { useEffect, useMemo, useState } from 'react'
import BpHeader from '@/components/BpHeader'
import MetricCard, { MetricSkeleton } from '@/components/MetricCard'
import { supabase } from '@/lib/supabaseClient'
import { fmtDate, fmtNum, iso, money } from '@/app/lib/fmt'

type Day = {
  business_date: string
  gross_sales: number
  net_sales: number
  tax: number
  discounts: number
  refunds: number
  order_count: number
  aov: number
}

function startOfWeekMon(d: Date) {
  const x = new Date(d)
  const day = x.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

export default function OpsHome() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [allowedTabs, setAllowedTabs] = useState<string[]>([])
  const [days, setDays] = useState<Day[]>([])

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/login'
        return
      }

      setEmail(sessionData.session.user.email ?? null)

      try {
        const meRes = await fetch('/api/me', {
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        })
        if (meRes.ok) {
          const me = await meRes.json()
          setAllowedTabs(me.allowedTabs ?? [])
        }
      } catch { /* non-fatal */ }

      const { data } = await supabase
        .from('sales_business_day')
        .select('business_date,gross_sales,net_sales,tax,discounts,refunds,order_count,aov')
        .order('business_date', { ascending: false })
        .limit(90)

      setDays((data as Day[] | null) ?? [])
      setLoading(false)
    }

    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const computed = useMemo(() => {
    const today = days[0] ?? null
    if (!today) return null

    const total = (arr: Day[]) => arr.reduce((s, x) => s + Number(x.gross_sales || 0), 0)
    const orders = (arr: Day[]) => arr.reduce((s, x) => s + Number(x.order_count || 0), 0)

    const t = new Date(today.business_date + 'T00:00:00')

    const mon = startOfWeekMon(t)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    const prevMon = new Date(mon); prevMon.setDate(mon.getDate() - 7)
    const prevEquiv = new Date(t); prevEquiv.setDate(t.getDate() - 7)

    const wtd = days.filter(x => x.business_date >= iso(mon) && x.business_date <= today.business_date)
    const lastWeekSameDays = days.filter(x => x.business_date >= iso(prevMon) && x.business_date <= iso(prevEquiv))
    const wtdSales = total(wtd)
    const wowPct = total(lastWeekSameDays) > 0
      ? ((wtdSales - total(lastWeekSameDays)) / total(lastWeekSameDays)) * 100
      : null

    const prevSun = new Date(mon); prevSun.setDate(mon.getDate() - 1)
    const lastWeekFull = days.filter(x => x.business_date >= iso(prevMon) && x.business_date <= iso(prevSun))
    const lastWeekSales = total(lastWeekFull)
    const lastWeekOrders = orders(lastWeekFull)

    const mtdFrom = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`
    const mtd = days.filter(x => x.business_date >= mtdFrom && x.business_date <= today.business_date)
    const mtdSales = total(mtd)

    const lmStart = new Date(t.getFullYear(), t.getMonth() - 1, 1)
    const lmEnd = new Date(t.getFullYear(), t.getMonth(), 0)
    const lmFrom = iso(lmStart)
    const lmTo = iso(lmEnd)
    const lastMonth = days.filter(x => x.business_date >= lmFrom && x.business_date <= lmTo)
    const lastMonthSales = total(lastMonth)
    const momPct = lastMonthSales > 0 ? ((mtdSales - lastMonthSales) / lastMonthSales) * 100 : null

    return {
      today,
      wtdSales, wowPct,
      wtdFrom: iso(mon), weekSun: iso(sun),
      lastWeekSales, lastWeekOrders,
      lastWeekFrom: iso(prevMon), lastWeekTo: iso(prevSun),
      mtdSales, mtdFrom,
      lastMonthSales, lmFrom, lmTo, momPct,
    }
  }, [days])

  const pctTone = (p: number | null) => {
    if (p === null) return 'var(--muted-strong)'
    return p >= 0 ? '#5bd38b' : '#e58080'
  }

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} activeTab="dashboard" allowedTabs={allowedTabs} />

      <div className="bp-container">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 14,
            marginTop: 18,
          }}
        >
          {loading || !computed ? (
            <>
              <MetricSkeleton primary />
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </>
          ) : (
            <>
              <MetricCard
                primary
                label={`Today · ${fmtDate(computed.today.business_date)}`}
                value={money(computed.today.gross_sales)}
                foot={
                  <>
                    Orders: {fmtNum(computed.today.order_count)} &nbsp;·&nbsp; AOV: {money(computed.today.aov)}
                  </>
                }
              />

              <MetricCard
                label="This week"
                sub={`${fmtDate(computed.wtdFrom)} – ${fmtDate(computed.weekSun)}`}
                value={money(computed.wtdSales)}
                foot={
                  <>
                    vs same days last week:{' '}
                    <span style={{ color: pctTone(computed.wowPct), fontWeight: 600 }}>
                      {computed.wowPct === null ? 'n/a' : `${computed.wowPct >= 0 ? '+' : ''}${computed.wowPct.toFixed(1)}%`}
                    </span>
                  </>
                }
              />

              <MetricCard
                label="Last week"
                sub={`${fmtDate(computed.lastWeekFrom)} – ${fmtDate(computed.lastWeekTo)}`}
                value={money(computed.lastWeekSales)}
                foot={<>Orders: {fmtNum(computed.lastWeekOrders)}</>}
              />

              <MetricCard
                label="This month"
                sub={`${fmtDate(computed.mtdFrom)} – today`}
                value={money(computed.mtdSales)}
                foot={
                  <>
                    Last month ({fmtDate(computed.lmFrom).slice(3)}): {money(computed.lastMonthSales)}{' '}
                    {computed.momPct !== null && (
                      <span style={{ color: pctTone(computed.momPct), fontWeight: 600 }}>
                        ({computed.momPct >= 0 ? '+' : ''}{computed.momPct.toFixed(1)}%)
                      </span>
                    )}
                  </>
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
