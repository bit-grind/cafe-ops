'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Day = {
  business_date: string
  gross_sales: number
  net_sales: number
  order_count: number
  aov: number
}

export default function OpsHome() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [days, setDays] = useState<Day[]>([])

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session

      if (!session) {
        window.location.href = '/login'
        return
      }

      setEmail(session.user.email ?? null)

      const { data } = await supabase
        .from('sales_business_day')
        .select('*')
        .order('business_date', { ascending: false })
        .limit(7)

      setDays(data ?? [])
      setLoading(false)
    }

    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>

  const total7Days = days.reduce((sum, d) => sum + Number(d.gross_sales), 0)
  const today = days[0]

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1>Ops Dashboard</h1>
        <button onClick={signOut}>Sign out</button>
      </div>

      <p>Signed in as: <b>{email}</b></p>

      <div style={{ marginTop: 30 }}>
        <h2>Today</h2>
        <p>Gross Sales: ${today?.gross_sales ?? 0}</p>
        <p>Orders: {today?.order_count ?? 0}</p>
        <p>AOV: ${today?.aov ?? 0}</p>
      </div>

      <div style={{ marginTop: 30 }}>
        <h2>Last 7 Days</h2>
        <p>Total Gross Sales: ${total7Days}</p>
      </div>
    </div>
  )
}
