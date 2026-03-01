'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function OpsHome() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    async function run() {
      const { data } = await supabase.auth.getSession()
      const session = data.session

      if (!session) {
        window.location.href = '/login'
        return
      }

      setEmail(session.user.email ?? null)
      setLoading(false)
    }
    run()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'system-ui' }}>
        <h1>Ops Dashboard</h1>
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Ops Dashboard</h1>
        <button onClick={signOut} style={{ padding: '8px 12px' }}>Sign out</button>
      </div>

      <p>Signed in as: <b>{email ?? 'Unknown'}</b></p>
      <p>Next we will wire this to real sales data.</p>
    </div>
  )
}
