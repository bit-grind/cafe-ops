'use client'

import { useEffect, useMemo, useState } from 'react'
import BpHeader from '@/components/BpHeader'
import MetricCard, { MetricSkeleton } from '@/components/MetricCard'
import { supabase } from '@/lib/supabaseClient'
import { fmtDate, fmtNum, iso, money } from '@/lib/fmt'
import type { AppTab } from '@/lib/permissions'

type Day = {
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

type Brief = {
  brief_date: string
  narrative: string
  generated_at?: string
  metrics?: { day_of_week?: string; vs_same_weekday_avg_pct?: number | null }
}

type MeResponse = {
  allowedTabs?: AppTab[]
  isGuest?: boolean
  isKitchen?: boolean
}

type LiveSalesResponse = {
  business_date: string
  day: Day | null
  fetched_at: string
}

const LIVE_SALES_INTERVAL_MS = 10 * 60 * 1000

function startOfWeekMon(d: Date) {
  const x = new Date(d)
  const day = x.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

function mergeDay(days: Day[], day: Day) {
  return [day, ...days.filter(d => d.business_date !== day.business_date)]
    .sort((a, b) => b.business_date.localeCompare(a.business_date))
}

function fmtBrisbaneTime(value: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function OpsHome() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [allowedTabs, setAllowedTabs] = useState<AppTab[]>([])
  const [days, setDays] = useState<Day[]>([])
  const [liveBusinessDate, setLiveBusinessDate] = useState<string | null>(null)
  const [liveSalesUpdatedAt, setLiveSalesUpdatedAt] = useState<string | null>(null)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [briefLoading, setBriefLoading] = useState(true)
  const [briefError, setBriefError] = useState(false)
  const [showBrief, setShowBrief] = useState(false)

  useEffect(() => {
    let cancelled = false
    let liveSalesTimer: number | undefined

    async function loadSales(accessToken: string) {
      const res = await fetch('/api/sales?limit=90', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      }).catch(() => null)
      if (!res?.ok) return
      const body = await res.json()
      if (!cancelled) setDays((body.days as Day[] | null) ?? [])
    }

    async function loadLiveSales(accessToken?: string) {
      const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token
      if (!token) return
      const res = await fetch('/api/sales/live', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }).catch(() => null)
      if (!res?.ok) return
      const body = await res.json() as LiveSalesResponse
      if (cancelled) return
      setLiveBusinessDate(body.business_date)
      setLiveSalesUpdatedAt(body.fetched_at)
      if (body.day) setDays(prev => mergeDay(prev, body.day as Day))
    }

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/login'
        return
      }

      setEmail(sessionData.session.user.email ?? null)

      // Fire /api/me and the sales query in parallel — they're independent.
      const accessToken = sessionData.session.access_token
      const [meRes] = await Promise.all([
        fetch('/api/me', { headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => null),
        loadSales(accessToken),
        loadLiveSales(accessToken),
      ])

      let canLoadBrief = true
      if (meRes?.ok) {
        try {
          const me = await meRes.json() as MeResponse
          // Kitchen users land on their own dashboard, not the sales one.
          if (me.isKitchen) {
            window.location.replace('/ops/kitchen')
            return
          }
          setAllowedTabs(me.allowedTabs ?? [])
          canLoadBrief = !me.isGuest
        } catch { /* non-fatal */ }
      }
      setShowBrief(canLoadBrief)

      // Morning brief loads independently so it never delays the metric cards.
      // Generation is cron-owned; this read never triggers paid AI work.
      if (canLoadBrief) {
        fetch('/api/brief', { headers: { Authorization: `Bearer ${accessToken}` } })
          .then(r => {
            if (!r.ok) throw new Error('Brief request failed')
            return r.json()
          })
          .then(d => {
            setBrief((d?.brief as Brief | null | undefined) ?? null)
            setBriefError(false)
          })
          .catch(() => {
            setBrief(null)
            setBriefError(true)
          })
          .finally(() => setBriefLoading(false))
      } else {
        setBriefLoading(false)
      }

      if (!cancelled) {
        liveSalesTimer = window.setInterval(() => { void loadLiveSales() }, LIVE_SALES_INTERVAL_MS)
        setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
      if (liveSalesTimer) window.clearInterval(liveSalesTimer)
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const computed = useMemo(() => {
    const today = days[0] ?? null
    if (!today) return null
    const liveDay = liveBusinessDate
      ? days.find(x => x.business_date === liveBusinessDate) ?? null
      : today

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
      liveDay,
      liveBusinessDate: liveBusinessDate ?? today.business_date,
      wtdSales, wowPct,
      wtdFrom: iso(mon), weekSun: iso(sun),
      lastWeekSales, lastWeekOrders,
      lastWeekFrom: iso(prevMon), lastWeekTo: iso(prevSun),
      mtdSales, mtdFrom,
      lastMonthSales, lmFrom, lmTo, momPct,
    }
  }, [days, liveBusinessDate])

  const pctTone = (p: number | null) => {
    if (p === null) return 'var(--muted-strong)'
    return p >= 0 ? '#5bd38b' : '#e58080'
  }

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} activeTab="dashboard" allowedTabs={allowedTabs} />

      <div className="bp-container">
        {showBrief && (
          <div className="bp-card" style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: brief ? 8 : 0, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-strong)' }}>
                Morning brief
              </span>
              {brief?.metrics?.day_of_week && (
                <span style={{ fontSize: 11, color: 'var(--muted-strong)' }}>
                  {brief.metrics.day_of_week} · {fmtDate(brief.brief_date)}
                </span>
              )}
            </div>
            {brief ? (
              <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>
                {brief.narrative}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--muted-strong)' }}>
                {briefLoading
                  ? 'Preparing your morning brief…'
                  : briefError
                    ? 'Morning brief could not be loaded.'
                    : 'No morning brief is ready yet.'}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
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
                label="Live takings"
                sub={fmtDate(computed.liveBusinessDate)}
                value={computed.liveDay ? money(computed.liveDay.gross_sales) : '—'}
                foot={
                  computed.liveDay ? (
                    <>
                      Orders: {fmtNum(computed.liveDay.order_count)} &nbsp;·&nbsp; AOV: {money(computed.liveDay.aov)}
                      {computed.liveDay.updated_at
                        ? <> &nbsp;·&nbsp; Imported {fmtBrisbaneTime(computed.liveDay.updated_at)}</>
                        : liveSalesUpdatedAt && <> &nbsp;·&nbsp; Checked {fmtBrisbaneTime(liveSalesUpdatedAt)}</>}
                    </>
                  ) : (
                    <>
                      No sales imported yet
                      {liveSalesUpdatedAt && <> &nbsp;·&nbsp; Checked {fmtBrisbaneTime(liveSalesUpdatedAt)}</>}
                    </>
                  )
                }
              />

              {computed.today.business_date !== computed.liveBusinessDate && (
                <MetricCard
                  label={`Latest day · ${fmtDate(computed.today.business_date)}`}
                  value={money(computed.today.gross_sales)}
                  foot={
                    <>
                      Orders: {fmtNum(computed.today.order_count)} &nbsp;·&nbsp; AOV: {money(computed.today.aov)}
                    </>
                  }
                />
              )}

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
