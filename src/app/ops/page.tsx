'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import BpHeader from '@/components/BpHeader'
import { supabase } from '@/lib/supabaseClient'

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

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
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
  const [days30, setDays30] = useState<Day[]>([])

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/login'
        return
      }

      setEmail(sessionData.session.user.email ?? null)

      const { data } = await supabase
        .from('sales_business_day')
        .select('business_date,gross_sales,net_sales,tax,discounts,refunds,order_count,aov')
        .order('business_date', { ascending: false })
        .limit(30)

      setDays30((data as any) ?? [])
      setLoading(false)
    }

    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const computed = useMemo(() => {
    const d = days30
    const today = d[0]

    const total = (arr: Day[]) => arr.reduce((s, x) => s + Number(x.gross_sales || 0), 0)
    const orders = (arr: Day[]) => arr.reduce((s, x) => s + Number(x.order_count || 0), 0)

    const last7 = d.slice(0, 7)
    const last30 = d.slice(0, 30)

    let best: Day | null = null
    let worst: Day | null = null
    for (const x of last30) {
      if (!best || Number(x.gross_sales) > Number(best.gross_sales)) best = x
      if (!worst || Number(x.gross_sales) < Number(worst.gross_sales)) worst = x
    }

    let wtd: Day[] = []
    let lastWeek: Day[] = []
    if (today?.business_date) {
      const t = new Date(today.business_date + 'T00:00:00')
      const mon = startOfWeekMon(t)
      const monIso = iso(mon)
      const prevMon = new Date(mon); prevMon.setDate(prevMon.getDate() - 7)
      const prevSun = new Date(mon); prevSun.setDate(prevSun.getDate() - 1)

      wtd = last30.filter(x => x.business_date >= monIso && x.business_date <= today.business_date)
      lastWeek = last30.filter(x => x.business_date >= iso(prevMon) && x.business_date <= iso(prevSun))
    }

    const wtdSales = total(wtd)
    const lastWeekSales = total(lastWeek)
    const wowPct = lastWeekSales > 0 ? ((wtdSales - lastWeekSales) / lastWeekSales) * 100 : null

    return {
      today,
      last7Sales: total(last7),
      last7Orders: orders(last7),
      last30Sales: total(last30),
      best,
      worst,
      wtdSales,
      wowPct,
    }
  }, [days30])

  const fmt = (n: any) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
  const money = (n: any) =>
    '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} />

      <div className="bp-container">
        {loading ? (
          <div style={{ opacity: 0.7 }}>Loading…</div>
        ) : (
          <>
            <div style={{ marginTop: 8, opacity: 0.6, letterSpacing: 1 }}>
              fast. funky. fresh.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginTop: 18 }}>
              <div className="bp-card">
                <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>
                  Today ({computed.today?.business_date})
                </div>
                <div style={{ fontSize: 30, marginTop: 8 }}>{money(computed.today?.gross_sales)}</div>
                <div style={{ opacity: 0.65, marginTop: 6 }}>
                  Orders: {fmt(computed.today?.order_count)} • AOV: {money(computed.today?.aov)}
                </div>
              </div>

              <div className="bp-card">
                <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>This week-to-date</div>
                <div style={{ fontSize: 30, marginTop: 8 }}>{money(computed.wtdSales)}</div>
                <div style={{ opacity: 0.65, marginTop: 6 }}>
                  vs last week: {computed.wowPct === null ? 'n/a' : `${computed.wowPct.toFixed(1)}%`}
                </div>
              </div>

              <div className="bp-card">
                <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>Last 7 days</div>
                <div style={{ fontSize: 30, marginTop: 8 }}>{money(computed.last7Sales)}</div>
                <div style={{ opacity: 0.65, marginTop: 6 }}>Orders: {fmt(computed.last7Orders)}</div>
              </div>

              <div className="bp-card">
                <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>Last 30 days</div>
                <div style={{ fontSize: 30, marginTop: 8 }}>{money(computed.last30Sales)}</div>
                <div style={{ opacity: 0.65, marginTop: 6, lineHeight: 1.5 }}>
                  Best: {computed.best?.business_date} ({money(computed.best?.gross_sales)})<br />
                  Worst: {computed.worst?.business_date} ({money(computed.worst?.gross_sales)})
                </div>
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              <Link href="/ops/ask" className="bp-btn">
                Ask AI →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}