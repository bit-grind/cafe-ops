'use client'

import { useEffect, useMemo, useState } from 'react'
import BpHeader from '@/components/BpHeader'
import MetricCard, { MetricSkeleton } from '@/components/MetricCard'
import { supabase } from '@/lib/supabaseClient'
import { fmtDate, money } from '@/app/lib/fmt'

type WeekRow = { week_start: string; week_end: string; total: number }

export default function KitchenHome() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [allowedTabs, setAllowedTabs] = useState<string[]>([])
  const [weeks, setWeeks] = useState<WeekRow[]>([])

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/login'
        return
      }

      setEmail(sessionData.session.user.email ?? null)
      const accessToken = sessionData.session.access_token
      const auth = { Authorization: `Bearer ${accessToken}` }

      const [meRes, costRes] = await Promise.all([
        fetch('/api/me', { headers: auth }).catch(() => null),
        fetch('/api/food-cost?weeks=12', { headers: auth }).catch(() => null),
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
    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const computed = useMemo(() => {
    if (weeks.length === 0) return null
    const thisWeek = weeks[weeks.length - 1]
    const lastWeek = weeks.length >= 2 ? weeks[weeks.length - 2] : null
    const prior = weeks.slice(0, Math.max(0, weeks.length - 1))
    const avg4 = prior.length > 0
      ? prior.slice(-4).reduce((s, w) => s + w.total, 0) / Math.min(4, prior.length)
      : 0
    const wowPct = lastWeek && lastWeek.total > 0
      ? ((thisWeek.total - lastWeek.total) / lastWeek.total) * 100
      : null
    const avgPct = avg4 > 0 ? ((thisWeek.total - avg4) / avg4) * 100 : null
    return { thisWeek, lastWeek, avg4, wowPct, avgPct, history: weeks.slice().reverse() }
  }, [weeks])

  const pctTone = (p: number | null) => {
    if (p === null) return 'var(--muted-strong)'
    // Lower food cost trending is good (green); higher is bad (red).
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
                label="12-week total"
                value={money(weeks.reduce((s, w) => s + w.total, 0))}
                foot={<>Food, beverages, dairy, meat, produce, bakery, dry & frozen goods</>}
              />
            </>
          )}
        </div>

        {!loading && computed && (
          <div style={{ marginTop: 28 }}>
            <div
              style={{
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--muted-strong)',
                marginBottom: 10,
              }}
            >
              Weekly food cost
            </div>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              {computed.history.map((w, i) => (
                <div
                  key={w.week_start}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                    fontSize: 14,
                  }}
                >
                  <span>{fmtDate(w.week_start)} – {fmtDate(w.week_end)}</span>
                  <span style={{ fontWeight: 600 }}>{money(w.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
