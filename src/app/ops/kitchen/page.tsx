'use client'

import { useEffect, useMemo, useState } from 'react'
import BpHeader from '@/components/BpHeader'
import MetricCard, { MetricSkeleton } from '@/components/MetricCard'
import WeeklyCostChart, { type WeekRow } from '@/components/WeeklyCostChart'
import { supabase } from '@/lib/supabaseClient'
import { fmtDate, money } from '@/app/lib/fmt'

const RANGES = [
  { label: '4w', weeks: 4 },
  { label: '12w', weeks: 12 },
  { label: '26w', weeks: 26 },
  { label: '52w', weeks: 52 },
] as const

type RangeKey = typeof RANGES[number]['label']

export default function KitchenHome() {
  const [loading, setLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [allowedTabs, setAllowedTabs] = useState<string[]>([])
  const [weeks, setWeeks] = useState<WeekRow[]>([])
  const [range, setRange] = useState<RangeKey>('12w')
  const [token, setToken] = useState<string | null>(null)

  const selectedWeeks = RANGES.find(r => r.label === range)!.weeks

  useEffect(() => {
    async function init() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/login'
        return
      }
      setEmail(sessionData.session.user.email ?? null)
      const accessToken = sessionData.session.access_token
      setToken(accessToken)

      const [meRes, costRes] = await Promise.all([
        fetch('/api/me', { headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => null),
        fetch(`/api/food-cost?weeks=${selectedWeeks}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => null),
      ])

      if (meRes?.ok) {
        try {
          const me = await meRes.json()
          setAllowedTabs(me.allowedTabs ?? [])
        } catch { /* non-fatal */ }
      }
      if (costRes?.ok) {
        try {
          const body = await costRes.json()
          setWeeks((body.weeks as WeekRow[]) ?? [])
        } catch { /* non-fatal */ }
      }
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refetch when the range changes (after initial load).
  useEffect(() => {
    if (!token || loading) return
    let cancelled = false
    setChartLoading(true)
    fetch(`/api/food-cost?weeks=${selectedWeeks}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(body => {
        if (cancelled || !body) return
        setWeeks((body.weeks as WeekRow[]) ?? [])
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false)
      })
    return () => { cancelled = true }
  }, [range, token, loading, selectedWeeks])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const computed = useMemo(() => {
    if (weeks.length === 0) return null
    const thisWeek = weeks[weeks.length - 1]
    const lastWeek = weeks.length >= 2 ? weeks[weeks.length - 2] : null
    const prior = weeks.slice(0, Math.max(0, weeks.length - 1))
    const avgWindow = Math.min(4, prior.length)
    const avg4 = avgWindow > 0
      ? prior.slice(-avgWindow).reduce((s, w) => s + w.total, 0) / avgWindow
      : 0
    const wowPct = lastWeek && lastWeek.total > 0
      ? ((thisWeek.total - lastWeek.total) / lastWeek.total) * 100
      : null
    const avgPct = avg4 > 0 ? ((thisWeek.total - avg4) / avg4) * 100 : null
    const total = weeks.reduce((s, w) => s + w.total, 0)
    return { thisWeek, lastWeek, avg4, wowPct, avgPct, total }
  }, [weeks])

  const pctTone = (p: number | null) => {
    if (p === null) return 'var(--muted-strong)'
    // Lower cost trending is good.
    return p <= 0 ? '#5bd38b' : '#e58080'
  }

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} activeTab="kitchen" allowedTabs={allowedTabs} />

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
                label={`This week · ${fmtDate(computed.thisWeek.week_start)} – ${fmtDate(computed.thisWeek.week_end)}`}
                value={money(computed.thisWeek.total)}
                foot={
                  <>
                    vs last week:{' '}
                    <span style={{ color: pctTone(computed.wowPct), fontWeight: 600 }}>
                      {computed.wowPct === null ? 'n/a' : `${computed.wowPct >= 0 ? '+' : ''}${computed.wowPct.toFixed(1)}%`}
                    </span>
                  </>
                }
              />
              <MetricCard
                label="Last week"
                sub={computed.lastWeek ? `${fmtDate(computed.lastWeek.week_start)} – ${fmtDate(computed.lastWeek.week_end)}` : undefined}
                value={money(computed.lastWeek?.total ?? 0)}
              />
              <MetricCard
                label="4-week avg"
                sub="Prior 4 weeks"
                value={money(computed.avg4)}
                foot={
                  <>
                    this week vs avg:{' '}
                    <span style={{ color: pctTone(computed.avgPct), fontWeight: 600 }}>
                      {computed.avgPct === null ? 'n/a' : `${computed.avgPct >= 0 ? '+' : ''}${computed.avgPct.toFixed(1)}%`}
                    </span>
                  </>
                }
              />
              <MetricCard
                label={`${range} total`}
                sub="All supplier bills"
                value={money(computed.total)}
              />
            </>
          )}
        </div>

        <div style={{ marginTop: 28 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <div
              style={{
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--muted-strong)',
              }}
            >
              Weekly supplier cost
            </div>
            <div
              role="tablist"
              aria-label="Time range"
              style={{
                display: 'flex',
                border: '1px solid var(--border)',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              {RANGES.map(r => {
                const active = range === r.label
                return (
                  <button
                    key={r.label}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setRange(r.label)}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                      color: active ? '#fff' : 'var(--muted-strong)',
                      border: 'none',
                      borderLeft: '1px solid var(--border)',
                      cursor: 'pointer',
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 12,
              opacity: chartLoading ? 0.5 : 1,
              transition: 'opacity 120ms',
            }}
          >
            <WeeklyCostChart weeks={weeks} />
          </div>
        </div>
      </div>
    </div>
  )
}
