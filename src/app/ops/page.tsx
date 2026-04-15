'use client'

import { useEffect, useMemo, useState } from 'react'
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
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [days, setDays] = useState<Day[]>([])

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/login'
        return
      }

      setEmail(sessionData.session.user.email ?? null)

      // Ask the server whether we're admin — the admin email lives in an
      // env var server-side and is never sent to the browser.
      try {
        const meRes = await fetch('/api/me', {
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        })
        if (meRes.ok) {
          const me = await meRes.json()
          setIsAdmin(!!me.isAdmin)
        }
      } catch { /* non-fatal — treat as non-admin */ }

      const { data } = await supabase
        .from('sales_business_day')
        .select('business_date,gross_sales,net_sales,tax,discounts,refunds,order_count,aov')
        .order('business_date', { ascending: false })
        .limit(90)

      setDays((data as any) ?? [])
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

    // ── This week (Mon → today) ──────────────────────────────────────────────
    const mon = startOfWeekMon(t)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    const prevMon = new Date(mon); prevMon.setDate(mon.getDate() - 7)
    const prevEquiv = new Date(t); prevEquiv.setDate(t.getDate() - 7) // same day last week

    const wtd = days.filter(x => x.business_date >= iso(mon) && x.business_date <= today.business_date)
    const lastWeekSameDays = days.filter(x => x.business_date >= iso(prevMon) && x.business_date <= iso(prevEquiv))
    const wtdSales = total(wtd)
    const wowPct = total(lastWeekSameDays) > 0
      ? ((wtdSales - total(lastWeekSameDays)) / total(lastWeekSameDays)) * 100
      : null

    // ── Last week (previous Mon–Sun) ─────────────────────────────────────────
    const prevSun = new Date(mon); prevSun.setDate(mon.getDate() - 1)
    const lastWeekFull = days.filter(x => x.business_date >= iso(prevMon) && x.business_date <= iso(prevSun))
    const lastWeekSales = total(lastWeekFull)
    const lastWeekOrders = orders(lastWeekFull)

    // ── Month to date ────────────────────────────────────────────────────────
    const mtdFrom = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`
    const mtd = days.filter(x => x.business_date >= mtdFrom && x.business_date <= today.business_date)
    const mtdSales = total(mtd)

    // ── Last month (full calendar month) ────────────────────────────────────
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

  const fmt = (n: any) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
  const money = (n: any) =>
    '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const fmtDate = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y.slice(2)}` }

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} activeTab="dashboard" isAdmin={isAdmin} />

      <div className="bp-container">
        {loading || !computed ? (
          <div style={{ opacity: 0.7 }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginTop: 18 }}>

            {/* Today */}
            <div className="bp-card">
              <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>
                Today ({fmtDate(computed.today.business_date)})
              </div>
              <div style={{ fontSize: 30, marginTop: 8 }}>{money(computed.today.gross_sales)}</div>
              <div style={{ opacity: 0.65, marginTop: 6 }}>
                Orders: {fmt(computed.today.order_count)} • AOV: {money(computed.today.aov)}
              </div>
            </div>

            {/* This week */}
            <div className="bp-card">
              <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>This week</div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                {fmtDate(computed.wtdFrom)} – {fmtDate(computed.weekSun)}
              </div>
              <div style={{ fontSize: 30, marginTop: 8 }}>{money(computed.wtdSales)}</div>
              <div style={{ opacity: 0.65, marginTop: 6 }}>
                vs same days last week: {computed.wowPct === null ? 'n/a' : `${computed.wowPct.toFixed(1)}%`}
              </div>
            </div>

            {/* Last week */}
            <div className="bp-card">
              <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>Last week</div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                {fmtDate(computed.lastWeekFrom)} – {fmtDate(computed.lastWeekTo)}
              </div>
              <div style={{ fontSize: 30, marginTop: 8 }}>{money(computed.lastWeekSales)}</div>
              <div style={{ opacity: 0.65, marginTop: 6 }}>Orders: {fmt(computed.lastWeekOrders)}</div>
            </div>

            {/* This month vs last month */}
            <div className="bp-card">
              <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>This month</div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                {fmtDate(computed.mtdFrom)} – today
              </div>
              <div style={{ fontSize: 30, marginTop: 8 }}>{money(computed.mtdSales)}</div>
              <div style={{ opacity: 0.65, marginTop: 6 }}>
                Last month ({fmtDate(computed.lmFrom).slice(3)}): {money(computed.lastMonthSales)}
                {computed.momPct !== null && (
                  <span style={{ marginLeft: 6 }}>({computed.momPct.toFixed(1)}%)</span>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
