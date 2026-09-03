'use client'

import { useEffect, useState } from 'react'
import V2Shell from '@/components/v2/V2Shell'
import TrainingRoster from '@/components/TrainingRoster'
import { supabase } from '@/lib/supabaseClient'
import type { AppTab } from '@/lib/permissions'

export default function V2TrainingPage() {
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
        if (!tabs.includes('training')) {
          window.location.replace('/v2')
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
    <V2Shell
      activeTab="training"
      email={email}
      allowedTabs={allowedTabs}
      onSignOut={signOut}
      eyebrow="People"
      title="Training"
      description="Send new starters their onboarding link and track who has finished what."
    >
      <div className="bp-container">
        {loading ? (
          <div className="bp-card" style={{ color: 'var(--muted-strong)' }}>Loading…</div>
        ) : (
          <TrainingRoster isAdmin={isAdmin} />
        )}
      </div>
    </V2Shell>
  )
}
