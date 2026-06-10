'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fmtDate, fmtNum, money } from '@/lib/fmt'
import type { AppTab } from '@/lib/permissions'
import { supabase } from '@/lib/supabaseClient'
import { useBranding } from '@/lib/useBranding'
import {
  computeDashboardMetrics,
  sparklinePoints,
  splitBriefInsights,
  type DashboardDay,
  type DashboardHour,
} from '@/lib/v2Dashboard'
import styles from './page.module.css'

type Brief = {
  brief_date: string
  narrative: string
  generated_at?: string
  metrics?: { day_of_week?: string; vs_same_weekday_avg_pct?: number | null }
}

type Profile = {
  email?: string | null
  allowedTabs?: AppTab[]
  isGuest?: boolean
  isKitchen?: boolean
}

type DashboardResponse = {
  profile: Profile
  days: DashboardDay[]
  live_hours?: DashboardHour[]
  live_business_date: string
  fetched_at: string
}

type LiveSalesResponse = {
  business_date: string
  day: DashboardDay | null
  hours?: DashboardHour[]
  fetched_at: string
}

const LIVE_SALES_INTERVAL_MS = 10 * 60 * 1000

const NAV_ORDER: AppTab[] = ['dashboard', 'kitchen', 'recipes', 'bills', 'ask', 'calendar', 'admin']

const NAV_LABELS: Record<AppTab, string> = {
  dashboard: 'Overview',
  kitchen: 'Kitchen',
  recipes: 'Recipes',
  bills: 'Bills',
  ask: 'Ask AI',
  calendar: 'Calendar',
  admin: 'Admin',
}

const NAV_HREFS: Record<AppTab, string> = {
  dashboard: '/v2',
  kitchen: '/ops/kitchen',
  recipes: '/ops/recipes',
  bills: '/ops/bills',
  ask: '/ops/ask',
  calendar: '/ops/calendar',
  admin: '/ops/admin',
}

function mergeDay(days: DashboardDay[], day: DashboardDay) {
  return [day, ...days.filter(existing => existing.business_date !== day.business_date)]
    .sort((a, b) => b.business_date.localeCompare(a.business_date))
}

function fmtBrisbaneTime(value: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function pageDateLabel(value: string | null) {
  if (!value) return 'Live operations'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${value}T00:00:00Z`))
}

function hourLabel(hour: number) {
  if (hour === 0) return '12'
  if (hour > 12) return String(hour - 12)
  return String(hour)
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={spinning ? styles.refreshSpinning : styles.refreshIcon}
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

function NavMark({ active }: { active?: boolean }) {
  return <span className={active ? `${styles.navMark} ${styles.navMarkActive}` : styles.navMark} aria-hidden="true" />
}

function HourlyChart({ hours }: { hours: DashboardHour[] }) {
  const salesByHour = new Map(hours.map(hour => [hour.hour, Number(hour.gross_sales || 0)]))
  const buckets = Array.from({ length: 10 }, (_, index) => {
    const hour = index + 5
    return { hour, sales: salesByHour.get(hour) ?? 0 }
  })
  const max = Math.max(...buckets.map(bucket => bucket.sales), 1)
  const strongest = buckets.reduce((best, bucket) => bucket.sales > best.sales ? bucket : best, buckets[0])

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartHeader}>
        <span className={styles.eyebrow}>Sales by hour</span>
        <span className={styles.chartCallout}>
          {strongest.sales > 0 ? (
            <><strong>{hourLabel(strongest.hour)}-{hourLabel(strongest.hour + 1)}{strongest.hour + 1 >= 12 ? 'pm' : 'am'}</strong> strongest hour</>
          ) : 'Waiting for hourly sales'}
        </span>
      </div>
      <div className={styles.bars} aria-label="Hourly sales bar chart">
        {buckets.map(bucket => (
          <div className={styles.barSlot} key={bucket.hour}>
            <div
              className={bucket.sales > 0 ? styles.bar : styles.barEmpty}
              style={{ height: `${Math.max(bucket.sales > 0 ? 7 : 2, (bucket.sales / max) * 100)}%` }}
              title={`${hourLabel(bucket.hour)}: ${money(bucket.sales)}`}
            />
            <span>{hourLabel(bucket.hour)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Sparkline({ values, muted = false }: { values: number[]; muted?: boolean }) {
  const points = sparklinePoints(values)
  if (!points) return <div className={styles.sparklineEmpty}>No comparison data yet</div>

  const areaPoints = `0,42 ${points} 180,42`
  return (
    <svg
      className={muted ? `${styles.sparkline} ${styles.sparklineMuted}` : styles.sparkline}
      viewBox="0 0 180 42"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={areaPoints} className={styles.sparklineArea} />
      <polyline points={points} className={styles.sparklineLine} />
    </svg>
  )
}

function TrendBadge({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className={styles.trendNeutral}>No comparison</span>
  const positive = value >= 0
  return (
    <span className={positive ? styles.trendUp : styles.trendDown}>
      {positive ? '+' : ''}{value.toFixed(1)}%{suffix}
    </span>
  )
}

function LoadingPage() {
  return (
    <div className={styles.loadingPage}>
      <div className={styles.loadingLogo} />
      <div className={styles.loadingBlock}>
        <div className={styles.loadingLine} />
        <div className={styles.loadingHero} />
        <div className={styles.loadingGrid}>
          <div />
          <div />
          <div />
        </div>
      </div>
    </div>
  )
}

export default function V2DashboardPage() {
  const branding = useBranding()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [allowedTabs, setAllowedTabs] = useState<AppTab[]>([])
  const [isGuest, setIsGuest] = useState(false)
  const [days, setDays] = useState<DashboardDay[]>([])
  const [liveHours, setLiveHours] = useState<DashboardHour[]>([])
  const [liveBusinessDate, setLiveBusinessDate] = useState<string | null>(null)
  const [liveSalesUpdatedAt, setLiveSalesUpdatedAt] = useState<string | null>(null)
  const [liveRefreshing, setLiveRefreshing] = useState(false)
  const [liveRefreshError, setLiveRefreshError] = useState(false)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [briefLoading, setBriefLoading] = useState(true)
  const [briefExpanded, setBriefExpanded] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const loadLiveSales = useCallback(async (accessToken?: string) => {
    const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return false
    try {
      const response = await fetch('/api/sales/live', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!response.ok) return false
      const body = await response.json() as LiveSalesResponse
      setLiveBusinessDate(body.business_date)
      setLiveHours(body.hours ?? [])
      setLiveSalesUpdatedAt(body.fetched_at)
      if (body.day) setDays(previous => mergeDay(previous, body.day as DashboardDay))
      setLiveRefreshError(false)
      return true
    } catch {
      return false
    }
  }, [])

  const refreshLiveSales = useCallback(async () => {
    setLiveRefreshing(true)
    try {
      const succeeded = await loadLiveSales()
      setLiveRefreshError(!succeeded)
    } finally {
      setLiveRefreshing(false)
    }
  }, [loadLiveSales])

  useEffect(() => {
    let cancelled = false
    let liveTimer: number | undefined

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.replace('/login')
        return
      }

      const accessToken = sessionData.session.access_token
      setEmail(sessionData.session.user.email ?? null)

      const dashboardResponse = await fetch('/api/dashboard?limit=90', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      }).catch(() => null)

      if (!dashboardResponse?.ok) {
        if (!cancelled) {
          setLoadError(true)
          setLoading(false)
        }
        return
      }

      const dashboard = await dashboardResponse.json() as DashboardResponse
      if (cancelled) return

      setEmail(dashboard.profile.email ?? sessionData.session.user.email ?? null)
      setAllowedTabs(dashboard.profile.allowedTabs ?? [])
      setIsGuest(Boolean(dashboard.profile.isGuest))
      setDays(dashboard.days ?? [])
      setLiveHours(dashboard.live_hours ?? [])
      setLiveBusinessDate(dashboard.live_business_date)
      setLiveSalesUpdatedAt(dashboard.fetched_at)

      if (!dashboard.profile.isGuest) {
        fetch('/api/brief', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        })
          .then(response => response.ok ? response.json() : null)
          .then(body => {
            if (!cancelled && body) setBrief((body.brief as Brief | null | undefined) ?? null)
          })
          .finally(() => {
            if (!cancelled) setBriefLoading(false)
          })
      } else {
        setBriefLoading(false)
      }

      liveTimer = window.setInterval(() => { void loadLiveSales() }, LIVE_SALES_INTERVAL_MS)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
      if (liveTimer) window.clearInterval(liveTimer)
    }
  }, [loadLiveSales])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  const metrics = useMemo(
    () => computeDashboardMetrics(days, liveBusinessDate),
    [days, liveBusinessDate],
  )

  const visibleTabs = NAV_ORDER.filter(tab => allowedTabs.includes(tab))
  const primaryMobileTabs = (['dashboard', 'kitchen', 'bills', 'ask'] as AppTab[])
    .filter(tab => visibleTabs.includes(tab))
    .slice(0, 4)
  const extraMobileTabs = visibleTabs.filter(tab => !primaryMobileTabs.includes(tab) && tab !== 'dashboard')
  const briefInsights = brief ? splitBriefInsights(brief.narrative) : []
  const liveUpdatedAt = metrics?.liveDay?.updated_at ?? liveSalesUpdatedAt
  const typicalDay = metrics
    ? new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Brisbane',
        weekday: 'short',
      }).format(new Date(`${metrics.liveBusinessDate}T00:00:00Z`))
    : 'day'

  if (loading) return <LoadingPage />

  if (loadError || !metrics) {
    return (
      <main className={styles.errorPage}>
        <div className={styles.errorCard}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.logoSrc} alt={`${branding.displayName} logo`} />
          <span className={styles.eyebrow}>Dashboard unavailable</span>
          <h1>We could not load the live view.</h1>
          <p>The current dashboard is still available while this preview reconnects.</p>
          <div className={styles.errorActions}>
            <button className={styles.button} onClick={() => window.location.reload()}>Try again</button>
            <Link className={styles.buttonSecondary} href="/ops">Open current dashboard</Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <>
      <header className={styles.mobileHeader}>
        <Link href="/v2" className={styles.mobileBrand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.logoSrc} alt={`${branding.displayName} logo`} />
          <span><strong>{branding.displayName}</strong><small>{branding.subtitle}</small></span>
        </Link>
        <button
          type="button"
          className={styles.accountButton}
          onClick={() => setMobileMenuOpen(open => !open)}
          aria-expanded={mobileMenuOpen}
          aria-label="Open account and navigation menu"
        >
          {(email?.[0] ?? 'O').toUpperCase()}
        </button>
      </header>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <Link href="/v2" className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={branding.logoSrc} alt={`${branding.displayName} logo`} />
            <span><strong>{branding.displayName}</strong><small>Operations</small></span>
          </Link>

          <div className={styles.navLabel}>Workspace</div>
          <nav className={styles.nav} aria-label="V2 primary navigation">
            {visibleTabs.filter(tab => tab !== 'admin').map(tab => (
              <Link key={tab} href={NAV_HREFS[tab]} className={tab === 'dashboard' ? styles.navActive : styles.navLink}>
                <NavMark active={tab === 'dashboard'} />
                {NAV_LABELS[tab]}
              </Link>
            ))}
          </nav>

          {visibleTabs.includes('admin') && (
            <>
              <div className={styles.navLabel}>Manage</div>
              <nav className={styles.nav} aria-label="V2 management navigation">
                <Link href={NAV_HREFS.admin} className={styles.navLink}><NavMark />Admin</Link>
              </nav>
            </>
          )}

          <div className={styles.account}>
            <strong title={email ?? undefined}>{email ?? 'Signed in'}</strong>
            <span>Preview dashboard</span>
            <div className={styles.accountLinks}>
              <Link href="/ops">Current site</Link>
              <button type="button" onClick={() => void signOut()}>Sign out</button>
            </div>
          </div>
        </aside>

        <main className={styles.main}>
          <header className={styles.topbar}>
            <div className={styles.title}>
              <span className={styles.eyebrow}>{pageDateLabel(metrics.liveBusinessDate)}</span>
              <h1>Today at a glance</h1>
              <p>Live sales, key movement, and the morning brief in one view.</p>
            </div>
            <div className={styles.topActions}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => void refreshLiveSales()}
                disabled={liveRefreshing}
                aria-label="Refresh live takings"
                title="Refresh live takings"
              >
                <RefreshIcon spinning={liveRefreshing} />
              </button>
              {allowedTabs.includes('ask') && <Link href="/ops/ask" className={styles.askButton}>Ask {branding.displayName}</Link>}
            </div>
          </header>

          <section className={styles.hero}>
            <div className={styles.heroNumber}>
              <div>
                <div className={styles.heroLabelRow}>
                  <span className={styles.eyebrow}>Live takings</span>
                  <span className={liveRefreshError ? styles.statusError : styles.status}>
                    {liveRefreshError
                      ? 'Refresh failed'
                      : liveUpdatedAt ? `Updated ${fmtBrisbaneTime(liveUpdatedAt)}` : 'Checking freshness'}
                  </span>
                </div>
                <div className={styles.heroValue}>
                  {metrics.liveDay ? money(metrics.liveDay.gross_sales) : '--'}
                </div>
                <div className={styles.heroTrend}>
                  <TrendBadge value={metrics.liveVsTypicalPct} suffix={` vs typical ${typicalDay}`} />
                </div>
              </div>
              <div className={styles.heroMeta}>
                <div>
                  <strong>{metrics.liveDay ? fmtNum(metrics.liveDay.order_count) : '--'}</strong>
                  <span>Orders</span>
                </div>
                <div>
                  <strong>{metrics.liveDay ? money(metrics.liveDay.aov, 'AUD', 2) : '--'}</strong>
                  <span>Average order</span>
                </div>
              </div>
            </div>
            <HourlyChart hours={liveHours} />
          </section>

          <div className={isGuest ? `${styles.contentGrid} ${styles.contentGridSingle}` : styles.contentGrid}>
            <section className={styles.sectionPanel}>
              <div className={styles.sectionHead}>
                <div><h2>Performance</h2><span>How the business is moving</span></div>
                <Link href="/ops" className={styles.textLink}>View sales detail</Link>
              </div>
              <div className={styles.performanceGrid}>
                <article className={styles.performanceCard}>
                  <div className={styles.performanceTop}>
                    <div>
                      <span className={styles.eyebrow}>This week</span>
                      <small>{fmtDate(metrics.wtdFrom)} - {fmtDate(metrics.weekTo)}</small>
                    </div>
                    <TrendBadge value={metrics.wowPct} />
                  </div>
                  <div className={styles.performanceValue}>{money(metrics.wtdSales)}</div>
                  <Sparkline values={metrics.wtdSeries} />
                </article>

                <article className={styles.performanceCard}>
                  <div className={styles.performanceTop}>
                    <div>
                      <span className={styles.eyebrow}>Last week</span>
                      <small>{fmtDate(metrics.lastWeekFrom)} - {fmtDate(metrics.lastWeekTo)}</small>
                    </div>
                  </div>
                  <div className={styles.performanceValue}>{money(metrics.lastWeekSales)}</div>
                  <Sparkline values={metrics.lastWeekSeries} muted />
                  <span className={styles.cardFoot}>{fmtNum(metrics.lastWeekOrders)} orders</span>
                </article>

                <article className={styles.performanceCard}>
                  <div className={styles.performanceTop}>
                    <div>
                      <span className={styles.eyebrow}>This month</span>
                      <small>{fmtDate(metrics.mtdFrom)} - today</small>
                    </div>
                    <TrendBadge value={metrics.momPct} />
                  </div>
                  <div className={styles.performanceValue}>{money(metrics.mtdSales)}</div>
                  <Sparkline values={metrics.mtdSeries} />
                  <span className={styles.cardFoot}>Last month {money(metrics.lastMonthSales)}</span>
                </article>
              </div>
            </section>

            {!isGuest && (
              <section className={styles.sectionPanel}>
                <div className={styles.sectionHead}>
                  <div>
                    <h2>Morning brief</h2>
                    <span>{brief?.generated_at ? `Generated ${fmtBrisbaneTime(brief.generated_at)}` : 'Latest operational summary'}</span>
                  </div>
                  {brief && <span className={styles.dateBadge}>{brief.brief_date.slice(-2)}</span>}
                </div>

                {briefLoading ? (
                  <div className={styles.briefLoading}>
                    <div />
                    <div />
                    <div />
                  </div>
                ) : brief ? (
                  <>
                    <div className={styles.briefList}>
                      {briefInsights.map((insight, index) => (
                        <div className={styles.insight} key={`${index}-${insight.slice(0, 24)}`}>
                          <span className={styles.insightNumber}>{String(index + 1).padStart(2, '0')}</span>
                          <p>{insight}</p>
                        </div>
                      ))}
                    </div>
                    {briefExpanded && (
                      <div className={styles.fullBrief}>{brief.narrative}</div>
                    )}
                    <div className={styles.briefFooter}>
                      <span>{fmtDate(brief.brief_date)}</span>
                      <button type="button" onClick={() => setBriefExpanded(expanded => !expanded)}>
                        {briefExpanded ? 'Hide full brief' : 'Read full brief'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={styles.emptyBrief}>No morning brief is ready yet.</div>
                )}
              </section>
            )}
          </div>
        </main>
      </div>

      {mobileMenuOpen && (
        <div className={styles.mobileMenu}>
          <div className={styles.mobileMenuHeader}>
            <div><strong>{email ?? 'Signed in'}</strong><span>Preview dashboard</span></div>
            <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">Close</button>
          </div>
          <nav aria-label="More navigation">
            {extraMobileTabs.map(tab => (
              <Link key={tab} href={NAV_HREFS[tab]} onClick={() => setMobileMenuOpen(false)}>
                {NAV_LABELS[tab]}
              </Link>
            ))}
            <Link href="/ops">Current dashboard</Link>
            <button type="button" onClick={() => void signOut()}>Sign out</button>
          </nav>
        </div>
      )}

      <nav
        className={styles.mobileNav}
        aria-label="V2 mobile navigation"
        style={{ gridTemplateColumns: `repeat(${primaryMobileTabs.length + 1}, minmax(0, 1fr))` }}
      >
        {primaryMobileTabs.map(tab => (
          <Link key={tab} href={NAV_HREFS[tab]} className={tab === 'dashboard' ? styles.mobileNavActive : undefined}>
            <NavMark active={tab === 'dashboard'} />
            <span>{tab === 'dashboard' ? 'Today' : NAV_LABELS[tab].replace(' AI', '')}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setMobileMenuOpen(open => !open)} aria-expanded={mobileMenuOpen}>
          <NavMark active={mobileMenuOpen} />
          <span>More</span>
        </button>
      </nav>
    </>
  )
}
