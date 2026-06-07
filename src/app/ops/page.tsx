'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

type HourlySale = {
  business_date: string
  hour: number
  gross_sales: number
  net_sales: number
  tax: number
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
  email?: string | null
  allowedTabs?: AppTab[]
  isGuest?: boolean
  isKitchen?: boolean
}

type DashboardResponse = {
  profile: MeResponse
  days: Day[]
  live_hours?: HourlySale[]
  live_business_date: string
  fetched_at: string
}

type LiveSalesResponse = {
  business_date: string
  day: Day | null
  hours?: HourlySale[]
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

function briefDateLabel(date: string) {
  const formatted = fmtDate(date)
  const day = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    weekday: 'short',
  }).format(new Date(date + 'T00:00:00'))
  return `${day} ${formatted}`
}

function hourLabel(hour: number) {
  const suffix = hour < 12 ? 'am' : 'pm'
  const displayHour = hour % 12 || 12
  return `${displayHour}${suffix}`
}

function hourRangeLabel(hour: number) {
  return `${hourLabel(hour)}-${hourLabel((hour + 1) % 24)}`
}

// Light-blue, semi-transparent bar palette. Tweak these to experiment with the shade.
const BAR_FILL = 'linear-gradient(180deg, rgba(130,196,255,0.72) 0%, rgba(130,196,255,0.42) 100%)'
const BAR_BORDER = 'rgba(150,205,255,0.40)'
const BAR_GLOSS = 'rgba(200,230,255,0.42)'
const BAR_RING = 'rgba(150,205,255,0.45)'

function HourlySalesChart({ hours }: { hours: HourlySale[] }) {
  const [activeHour, setActiveHour] = useState<number | null>(null)
  const salesByHour = new Map(hours.map(row => [row.hour, Number(row.gross_sales || 0)]))
  const buckets = Array.from({ length: 10 }, (_, index) => {
    const hour = index + 5
    return {
      hour,
      label: hourLabel(hour),
      range: hourRangeLabel(hour),
      sales: salesByHour.get(hour) ?? 0,
    }
  })
  const maxSales = Math.max(...buckets.map(bucket => bucket.sales), 1)
  const guideStep = maxSales < 500 ? 250 : 500
  const guideMax = Math.max(guideStep * 2, Math.ceil(maxSales / guideStep) * guideStep)
  const guides = Array.from({ length: guideMax / guideStep }, (_, index) => (index + 1) * guideStep)

  if (!hours.length) {
    return (
      <div
        style={{
          minHeight: 126,
          marginTop: 18,
          border: '1px dashed rgba(255,255,255,0.18)',
          borderRadius: 8,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--muted-strong)',
          fontSize: 12,
          textAlign: 'center',
          padding: 16,
        }}
      >
        Waiting for Kounta hourly sales import
      </div>
    )
  }

  return (
    <div
      aria-label="Hourly sales bar chart"
      style={{
        position: 'relative',
        minHeight: 126,
        marginTop: 18,
        paddingTop: 4,
      }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', inset: '4px 0 28px 0' }}>
        {guides.map(value => (
          <div
            key={value}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: `${(value / guideMax) * 100}%`,
              borderTop: '1px solid rgba(255,255,255,0.11)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: -7,
                paddingLeft: 6,
                background: 'var(--panel)',
                color: 'var(--muted-strong)',
                fontSize: 9,
              }}
            >
              {money(value)}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: `repeat(${buckets.length}, minmax(18px, 1fr))`,
          alignItems: 'end',
          gap: 8,
        }}
      >
        {buckets.map(bucket => (
          <div
            key={bucket.hour}
            onMouseEnter={() => setActiveHour(bucket.hour)}
            onMouseLeave={() => setActiveHour(null)}
            onFocus={() => setActiveHour(bucket.hour)}
            onBlur={() => setActiveHour(null)}
            tabIndex={0}
            style={{ minWidth: 0, position: 'relative', cursor: 'default' }}
          >
            {activeHour === bucket.hour && (
              <div
                role="tooltip"
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 'calc(100% + 8px)',
                  transform: 'translateX(-50%)',
                  zIndex: 3,
                  whiteSpace: 'nowrap',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: '#181818',
                  color: 'var(--foreground)',
                  borderRadius: 8,
                  padding: '6px 8px',
                  boxShadow: '0 10px 26px rgba(0,0,0,0.36)',
                  fontSize: 11,
                  lineHeight: 1.2,
                  pointerEvents: 'none',
                }}
              >
                <div style={{ color: 'var(--muted-strong)', marginBottom: 2 }}>{bucket.range}</div>
                <div style={{ fontWeight: 600 }}>{money(bucket.sales)} total</div>
              </div>
            )}
            <div
              style={{
                height: 92,
                display: 'flex',
                alignItems: 'end',
                justifyContent: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <div
                style={{
                  width: '64%',
                  maxWidth: 34,
                  minWidth: 8,
                  minHeight: bucket.sales > 0 ? 6 : 2,
                  height: `${Math.max(2, (bucket.sales / guideMax) * 92)}px`,
                  borderRadius: '3px 3px 0 0',
                  border: bucket.sales > 0 ? `1px solid ${BAR_BORDER}` : '0',
                  borderBottom: 0,
                  background: bucket.sales > 0 ? BAR_FILL : 'rgba(255,255,255,0.12)',
                  boxShadow: activeHour === bucket.hour
                    ? `0 0 0 1px ${BAR_RING}, 0 10px 24px rgba(0,0,0,0.36)`
                    : bucket.sales > 0 ? `inset 0 1px 0 ${BAR_GLOSS}` : 'none',
                  transition: 'background 0.15s, box-shadow 0.15s, opacity 0.15s',
                }}
              />
            </div>
            <div style={{ marginTop: 7, fontSize: 10, color: 'var(--muted-strong)', textAlign: 'center' }}>
              {bucket.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={spinning ? 'live-refresh-icon live-refresh-icon--spinning' : 'live-refresh-icon'}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 6v5h-5M4 18v-5h5M18.3 10a6.5 6.5 0 0 0-10.7-2.4L4 11m16 2-3.6 3.4A6.5 6.5 0 0 1 5.7 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function OpsHome() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [allowedTabs, setAllowedTabs] = useState<AppTab[]>([])
  const [isKitchen, setIsKitchen] = useState<boolean | null>(null)
  const [days, setDays] = useState<Day[]>([])
  const [liveHours, setLiveHours] = useState<HourlySale[]>([])
  const [liveBusinessDate, setLiveBusinessDate] = useState<string | null>(null)
  const [liveSalesUpdatedAt, setLiveSalesUpdatedAt] = useState<string | null>(null)
  const [liveRefreshing, setLiveRefreshing] = useState(false)
  const [liveRefreshError, setLiveRefreshError] = useState(false)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [briefDates, setBriefDates] = useState<string[]>([])
  const [selectedBriefDate, setSelectedBriefDate] = useState<string | null>(null)
  const [briefLoading, setBriefLoading] = useState(true)
  const [briefError, setBriefError] = useState(false)
  const [showBrief, setShowBrief] = useState(false)

  const loadSalesForDate = useCallback(async (date?: string | null, accessToken?: string) => {
    try {
      const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token
      if (!token) return false
      const query = date ? `?date=${encodeURIComponent(date)}` : ''
      const res = await fetch(`/api/sales/live${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }).catch(() => null)
      if (!res?.ok) return false
      const body = await res.json() as LiveSalesResponse
      setLiveBusinessDate(body.business_date)
      setLiveSalesUpdatedAt(body.fetched_at)
      setLiveHours(body.hours ?? [])
      if (body.day) setDays(prev => mergeDay(prev, body.day as Day))
      setLiveRefreshError(false)
      return true
    } catch {
      return false
    }
  }, [])

  const refreshLiveSales = useCallback(async () => {
    setLiveRefreshing(true)
    try {
      const ok = await loadSalesForDate()
      setLiveRefreshError(!ok)
    } finally {
      setLiveRefreshing(false)
    }
  }, [loadSalesForDate])

  const loadBrief = useCallback(async (date?: string | null, accessToken?: string) => {
    const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return
    setBriefLoading(true)
    setBriefError(false)
    try {
      const query = date ? `?date=${encodeURIComponent(date)}` : ''
      const res = await fetch(`/api/brief${query}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Brief request failed')
      const d = await res.json() as { brief?: Brief | null; dates?: string[] }
      setBrief((d?.brief as Brief | null | undefined) ?? null)
      setBriefDates(d?.dates ?? [])
      const nextDate = d?.brief?.brief_date ?? date ?? null
      setSelectedBriefDate(nextDate)
    } catch {
      setBrief(null)
      setBriefError(true)
    } finally {
      setBriefLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let liveSalesTimer: number | undefined

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/login'
        return
      }

      setEmail(sessionData.session.user.email ?? null)
      const accessToken = sessionData.session.access_token

      const dashboardRes = await fetch('/api/dashboard?limit=90', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      }).catch(() => null)

      if (!dashboardRes?.ok) {
        if (!cancelled) setLoading(false)
        return
      }

      const dashboard = await dashboardRes.json() as DashboardResponse
      if (cancelled) return

      const profile = dashboard.profile
      setEmail(profile.email ?? sessionData.session.user.email ?? null)
      setAllowedTabs(profile.allowedTabs ?? [])
      setIsKitchen(Boolean(profile.isKitchen))
      setDays(dashboard.days ?? [])
      setLiveHours(dashboard.live_hours ?? [])
      setLiveBusinessDate(dashboard.live_business_date)
      setLiveSalesUpdatedAt(dashboard.fetched_at)
      const canLoadBrief = !profile.isGuest
      setShowBrief(canLoadBrief)

      // Morning brief loads independently so it never delays the metric cards.
      // Generation is cron-owned; this read never triggers paid AI work.
      if (canLoadBrief) {
        void loadBrief(null, accessToken)
      } else {
        setBriefLoading(false)
      }

      if (!cancelled) {
        liveSalesTimer = window.setInterval(() => { void loadSalesForDate() }, LIVE_SALES_INTERVAL_MS)
        setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
      if (liveSalesTimer) window.clearInterval(liveSalesTimer)
    }
  }, [loadBrief, loadSalesForDate])

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

  const selectedBriefIndex = selectedBriefDate ? briefDates.indexOf(selectedBriefDate) : -1
  const hasNewerBrief = selectedBriefIndex > 0
  const hasOlderBrief = selectedBriefIndex >= 0 && selectedBriefIndex < briefDates.length - 1

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} activeTab="dashboard" allowedTabs={allowedTabs} />

      <div className="bp-container">
        <div style={{ marginTop: 18 }}>
          {loading || !computed ? (
            <div className="bp-metric bp-metric--primary">
              <div className="bp-skel" style={{ width: 90, height: 11 }} />
              <div className="bp-skel" style={{ width: 160, height: 36, marginTop: 14 }} />
              <div className="bp-skel" style={{ width: '100%', height: 110, marginTop: 18 }} />
            </div>
          ) : (
            <div className="bp-metric bp-metric--primary" style={{ padding: 20 }}>
              <div className="live-takings-layout">
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div className="bp-metric__label">Live takings</div>
                      <div className="bp-metric__sub">{fmtDate(computed.liveBusinessDate)}</div>
                    </div>
                    <button
                      type="button"
                      className="bp-btn"
                      onClick={() => void refreshLiveSales()}
                      disabled={liveRefreshing}
                      aria-label="Refresh live takings"
                      title="Refresh live takings"
                      style={{ flex: '0 0 auto', width: 36, height: 36, padding: 0, borderRadius: 8, display: 'grid', placeItems: 'center' }}
                    >
                      <RefreshIcon spinning={liveRefreshing} />
                    </button>
                  </div>
                  <div className="bp-metric__value">{computed.liveDay ? money(computed.liveDay.gross_sales) : '—'}</div>
                  <div className="bp-metric__foot">
                    {computed.liveDay ? (
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
                    )}
                    {liveRefreshError && <> &nbsp;·&nbsp; Refresh failed</>}
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted-strong)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                      Hourly sales
                    </span>
                  </div>
                  <HourlySalesChart hours={liveHours} />
                </div>
              </div>
            </div>
          )}
        </div>

        {showBrief && (
          <div className="bp-card" style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: brief ? 8 : 0, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-strong)' }}>
                  Morning brief
                </span>
                {brief?.metrics?.day_of_week && (
                  <span style={{ fontSize: 11, color: 'var(--muted-strong)' }}>
                    {brief.metrics.day_of_week} · {fmtDate(brief.brief_date)}
                  </span>
                )}
              </div>
              {briefDates.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="bp-btn"
                    onClick={() => hasOlderBrief && void loadBrief(briefDates[selectedBriefIndex + 1])}
                    disabled={briefLoading || !hasOlderBrief}
                    aria-label="Previous date"
                    style={{ width: 40, padding: '7px 10px', borderRadius: 8, fontSize: 16, lineHeight: 1 }}
                  >
                    ←
                  </button>
                  <select
                    className="bp-input"
                    value={selectedBriefDate ?? ''}
                    onChange={event => void loadBrief(event.target.value)}
                    disabled={briefLoading}
                    aria-label="Select morning brief date"
                    style={{ width: 'auto', minWidth: 138, padding: '7px 10px', borderRadius: 8, fontSize: 12 }}
                  >
                    {briefDates.map(date => (
                      <option key={date} value={date}>{briefDateLabel(date)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="bp-btn"
                    onClick={() => void loadBrief(null)}
                    disabled={briefLoading || !hasNewerBrief}
                    style={{ padding: '7px 10px', borderRadius: 8, fontSize: 12 }}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className="bp-btn"
                    onClick={() => hasNewerBrief && void loadBrief(briefDates[selectedBriefIndex - 1])}
                    disabled={briefLoading || !hasNewerBrief}
                    aria-label="Next date"
                    style={{ width: 40, padding: '7px 10px', borderRadius: 8, fontSize: 16, lineHeight: 1 }}
                  >
                    →
                  </button>
                </div>
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

        {isKitchen === false && (
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
        )}
      </div>
    </div>
  )
}
