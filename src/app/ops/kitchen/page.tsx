'use client'

import { useEffect, useMemo, useState } from 'react'
import BpHeader from '@/components/BpHeader'
import MetricCard, { MetricSkeleton } from '@/components/MetricCard'
import { supabase } from '@/lib/supabaseClient'
import { fmtDate, fmtNum, iso } from '@/app/lib/fmt'

type ProductRow = {
  business_date: string
  product: string
  quantity: number
  sale_amount: number | null
}

function startOfWeekMon(d: Date) {
  const x = new Date(d)
  const day = x.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

type TopItem = { product: string; quantity: number }

// Kitchen doesn't prepare drinks or size modifiers — baristas handle those.
// Filter them out so the stats focus on food items.
const EXCLUDED_PRODUCTS = new Set<string>([
  // Coffee size modifiers (Lightspeed tracks the size as its own line)
  'Small', 'Medium', 'Large', 'Small OL', 'Medium OL', 'Large OL', 'Shorty', '8oz',
  // Hot coffee
  'Cappuccino', 'Flat White', 'Latte', 'Long Black', 'Mocha', 'Piccolo Latté',
  // Hot non-coffee drinks
  'Hot Chocolate', 'Tea', 'Matcha',
  // Iced drinks
  'Iced Chocolate', 'Iced Latté', 'Iced Long Black', 'Iced Matcha', 'Iced Tea',
  // Juices / shakes
  'E&T Juice (Small)', 'E&T Juice (Large)', 'Cold Press', 'Milkshake', 'Thickshake', 'Kids Milkshake',
  // Other drinks
  'Coke', 'Diet Coke', 'Lemonade', 'Sparkling Water', 'Bottled Water', 'Kombucha',
])

function aggregate(rows: ProductRow[]): { total: number; top: TopItem[] } {
  const byProduct = new Map<string, number>()
  let total = 0
  for (const r of rows) {
    if (EXCLUDED_PRODUCTS.has(r.product)) continue
    const q = Number(r.quantity || 0)
    total += q
    byProduct.set(r.product, (byProduct.get(r.product) ?? 0) + q)
  }
  const top = [...byProduct.entries()]
    .map(([product, quantity]) => ({ product, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)
  return { total, top }
}

export default function KitchenHome() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [allowedTabs, setAllowedTabs] = useState<string[]>([])
  const [rows, setRows] = useState<ProductRow[]>([])

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/login'
        return
      }

      setEmail(sessionData.session.user.email ?? null)

      const accessToken = sessionData.session.access_token

      // Pull the last ~45 days of product rows. With ~40 products/day this is
      // well under Supabase's default row cap.
      const today = new Date()
      const from = new Date(today)
      from.setDate(from.getDate() - 45)

      const [meRes, rowsRes] = await Promise.all([
        fetch('/api/me', { headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => null),
        supabase
          .from('sales_by_product')
          .select('business_date,product,quantity,sale_amount')
          .gte('business_date', iso(from))
          .order('business_date', { ascending: false })
          .limit(5000),
      ])

      if (meRes?.ok) {
        try {
          const me = await meRes.json()
          setAllowedTabs(me.allowedTabs ?? [])
        } catch { /* non-fatal */ }
      }

      setRows((rowsRes.data as ProductRow[] | null) ?? [])
      setLoading(false)
    }

    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const computed = useMemo(() => {
    if (rows.length === 0) return null

    const latestDate = rows[0].business_date
    const t = new Date(latestDate + 'T00:00:00')

    const mon = startOfWeekMon(t)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    const prevMon = new Date(mon); prevMon.setDate(mon.getDate() - 7)
    const prevSun = new Date(mon); prevSun.setDate(mon.getDate() - 1)
    const mtdFrom = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`

    const today = rows.filter(r => r.business_date === latestDate)
    const thisWeek = rows.filter(r => r.business_date >= iso(mon) && r.business_date <= latestDate)
    const lastWeek = rows.filter(r => r.business_date >= iso(prevMon) && r.business_date <= iso(prevSun))
    const thisMonth = rows.filter(r => r.business_date >= mtdFrom && r.business_date <= latestDate)

    return {
      latestDate,
      weekRange: { from: iso(mon), to: iso(sun) },
      lastWeekRange: { from: iso(prevMon), to: iso(prevSun) },
      monthFrom: mtdFrom,
      today: aggregate(today),
      thisWeek: aggregate(thisWeek),
      lastWeek: aggregate(lastWeek),
      thisMonth: aggregate(thisMonth),
    }
  }, [rows])

  const topFoot = (top: TopItem[]) =>
    top.length === 0 ? <>No items</> : <>Top: {top.slice(0, 3).map(t => `${t.product} (${fmtNum(t.quantity)})`).join(' · ')}</>

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
                label={`Today · ${fmtDate(computed.latestDate)}`}
                value={`${fmtNum(computed.today.total)} items`}
                foot={topFoot(computed.today.top)}
              />

              <MetricCard
                label="This week"
                sub={`${fmtDate(computed.weekRange.from)} – ${fmtDate(computed.weekRange.to)}`}
                value={`${fmtNum(computed.thisWeek.total)} items`}
                foot={topFoot(computed.thisWeek.top)}
              />

              <MetricCard
                label="Last week"
                sub={`${fmtDate(computed.lastWeekRange.from)} – ${fmtDate(computed.lastWeekRange.to)}`}
                value={`${fmtNum(computed.lastWeek.total)} items`}
                foot={topFoot(computed.lastWeek.top)}
              />

              <MetricCard
                label="This month"
                sub={`${fmtDate(computed.monthFrom)} – today`}
                value={`${fmtNum(computed.thisMonth.total)} items`}
                foot={topFoot(computed.thisMonth.top)}
              />
            </>
          )}
        </div>

        {!loading && computed && computed.today.top.length > 0 && (
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
              Top products today
            </div>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              {computed.today.top.map((t, i) => (
                <div
                  key={t.product}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                    fontSize: 14,
                  }}
                >
                  <span>{t.product}</span>
                  <span style={{ fontWeight: 600 }}>{fmtNum(t.quantity)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
