'use client'

import { useEffect, useState } from 'react'
import BpHeader from '@/components/BpHeader'
import TrainingRoster from '@/components/TrainingRoster'
import { supabase } from '@/lib/supabaseClient'
import type { AppTab } from '@/lib/permissions'

export default function TrainingPage() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [allowedTabs, setAllowedTabs] = useState<AppTab[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/login'
        return
      }
      setEmail(sessionData.session.user.email ?? null)

      const meRes = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      }).catch(() => null)

      if (meRes?.ok) {
        const me = await meRes.json()
        const tabs: AppTab[] = me.allowedTabs ?? []
        // Onboarding is for admins and shift managers; everyone else goes home.
        if (!tabs.includes('training')) {
          window.location.replace('/ops')
          return
        }
        setAllowedTabs(tabs)
        setIsAdmin(!!me.isAdmin)
      }
      setLoading(false)
    }
    void init()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} activeTab="training" allowedTabs={allowedTabs} />

      <div className="bp-container" style={{ paddingTop: 28 }}>
        <div
          style={{
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted-strong)',
            marginBottom: 18,
          }}
        >
          Staff onboarding
        </div>

        {loading ? (
          <div className="bp-card" style={{ color: 'var(--muted-strong)' }}>Loading…</div>
        ) : (
          <TrainingRoster isAdmin={isAdmin} />
        )}
      </div>
    </div>
  )
}
