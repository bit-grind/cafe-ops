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

type Bill = {
  invoiceID: string
  invoiceNumber: string | null
  reference: string | null
  contactName: string | null
  date: string
  total: number
  status: string
  hasAttachments: boolean
}

export default function KitchenHome() {
  const [loading, setLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [allowedTabs, setAllowedTabs] = useState<string[]>([])
  const [weeks, setWeeks] = useState<WeekRow[]>([])
  const [range, setRange] = useState<RangeKey>('12w')
  const [token, setToken] = useState<string | null>(null)
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null)
  const [weekBills, setWeekBills] = useState<Record<string, Bill[] | 'loading'>>({})

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

  async function toggleWeek(weekStart: string) {
    if (expandedWeek === weekStart) {
      setExpandedWeek(null)
      return
    }
    setExpandedWeek(weekStart)
    if (weekBills[weekStart] || !token) return
    setWeekBills(prev => ({ ...prev, [weekStart]: 'loading' }))
    try {
      const res = await fetch(`/api/food-cost/week?start=${weekStart}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('load failed')
      const body = await res.json()
      setWeekBills(prev => ({ ...prev, [weekStart]: (body.bills as Bill[]) ?? [] }))
    } catch {
      setWeekBills(prev => ({ ...prev, [weekStart]: [] }))
    }
  }

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} activeTab="kitchen" allowedTabs={allowedTabs} />

      <div className="bp-container">
        <div
          style={{
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted-strong)',
            marginTop: 22,
            marginBottom: 10,
          }}
        >
          Kitchen costs
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 14,
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

          {!loading && weeks.length > 0 && (
            <div
              style={{
                marginTop: 18,
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              {weeks.slice().reverse().map((w, i) => {
                const expanded = expandedWeek === w.week_start
                const bills = weekBills[w.week_start]
                return (
                  <div key={w.week_start}>
                    <button
                      onClick={() => toggleWeek(w.week_start)}
                      aria-expanded={expanded}
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                        borderLeft: 'none',
                        borderRight: 'none',
                        borderBottom: 'none',
                        background: expanded ? 'rgba(255,255,255,0.04)' : 'transparent',
                        color: 'inherit',
                        font: 'inherit',
                        fontSize: 14,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <svg
                          aria-hidden
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          style={{
                            flexShrink: 0,
                            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 120ms',
                            color: 'var(--muted-strong)',
                          }}
                        >
                          <path d="M3 1 L7 5 L3 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fmtDate(w.week_start)} – {fmtDate(w.week_end)}
                        </span>
                      </span>
                      <span style={{ fontWeight: 600 }}>{money(w.total)}</span>
                    </button>

                    {expanded && (
                      <div
                        style={{
                          padding: '4px 16px 14px 40px',
                          borderTop: '1px solid var(--border)',
                          background: 'rgba(255,255,255,0.02)',
                        }}
                      >
                        {bills === 'loading' || bills === undefined ? (
                          <div style={{ fontSize: 13, color: 'var(--muted-strong)', padding: '10px 0' }}>
                            Loading…
                          </div>
                        ) : bills.length === 0 ? (
                          <div style={{ fontSize: 13, color: 'var(--muted-strong)', padding: '10px 0' }}>
                            No invoices in this week.
                          </div>
                        ) : (
                          <div>
                            {bills.map(b => (
                              <div
                                key={b.invoiceID}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '8px 0',
                                  borderTop: '1px solid var(--border)',
                                  fontSize: 13,
                                  gap: 12,
                                }}
                              >
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {b.contactName || '—'}
                                  </div>
                                  <div style={{ color: 'var(--muted-strong)', fontSize: 12, marginTop: 2 }}>
                                    {fmtDate(b.date)}
                                    {b.invoiceNumber ? ` · ${b.invoiceNumber}` : ''}
                                    {b.reference ? ` · ${b.reference}` : ''}
                                  </div>
                                </div>
                                <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{money(b.total)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
