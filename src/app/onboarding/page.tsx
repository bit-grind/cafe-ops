'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type MeResponse = {
  email?: string | null
  organization?: {
    id: string | null
    name: string | null
    slug: string | null
    role: string | null
    onboarding: {
      businessProfileComplete: boolean
      xeroConnected: boolean
      posConfigured: boolean
      suppliersMapped: boolean
      historicalDataImported: boolean
      launchedAt: string | null
    } | null
  } | null
}

type OnboardingStatus = {
  integrations?: Array<{
    provider: string
    status: string
    last_synced_at: string | null
    last_error: string | null
  }>
  nextStep?: string
}

export default function OnboardingPage() {
  const [email, setEmail] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [timezone, setTimezone] = useState('Australia/Brisbane')
  const [currencyCode, setCurrencyCode] = useState('AUD')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [organization, setOrganization] = useState<MeResponse['organization']>(null)
  const [integrations, setIntegrations] = useState<OnboardingStatus['integrations']>([])
  const [nextStep, setNextStep] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setBusy(true)
      setError(null)
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        window.location.href = '/login'
        return
      }

      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const body = (await res.json().catch(() => ({}))) as MeResponse
      if (cancelled) return

      if (!res.ok) {
        setError('Unable to load your account.')
      } else {
        setEmail(body.email ?? null)
        setOrganization(body.organization ?? null)
        if (body.organization?.name) setBusinessName(body.organization.name)

        if (body.organization) {
          const statusRes = await fetch('/api/onboarding/status', {
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
          const statusBody = (await statusRes.json().catch(() => ({}))) as OnboardingStatus
          if (!cancelled && statusRes.ok) {
            setIntegrations(statusBody.integrations ?? [])
            setNextStep(statusBody.nextStep ?? null)
          }
        }
      }
      setBusy(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function createOrganization(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      window.location.href = '/login'
      return
    }

    const res = await fetch('/api/onboarding/organization', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: businessName, timezone, currencyCode }),
    })
    const body = await res.json().catch(() => ({}))
    setSaving(false)

    if (!res.ok) {
      setError(body.error ?? 'Unable to create business profile.')
      return
    }

    setOrganization({
      ...body.organization,
      onboarding: {
        businessProfileComplete: true,
        xeroConnected: false,
        posConfigured: false,
        suppliersMapped: false,
        historicalDataImported: false,
        launchedAt: null,
      },
    })
    setIntegrations([])
    setNextStep('xero')
    setMessage(body.alreadyExists ? 'Business profile already exists.' : 'Business profile created.')
  }

  const xeroStatus = integrations?.find((row) => row.provider === 'xero')?.status
  const steps = [
    ['Business profile', !!organization?.onboarding?.businessProfileComplete || !!organization],
    ['Connect Xero', xeroStatus === 'connected' || !!organization?.onboarding?.xeroConnected],
    ['Configure sales import', !!organization?.onboarding?.posConfigured],
    ['Map suppliers', !!organization?.onboarding?.suppliersMapped],
    ['Import history', !!organization?.onboarding?.historicalDataImported],
  ] as const

  return (
    <main className="bp-container" style={{ maxWidth: 920 }}>
      <div style={{ display: 'grid', gap: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: '0.14em', color: 'var(--muted-strong)', fontWeight: 700 }}>
              OPS PLATFORM
            </div>
            <h1 style={{ fontSize: 28, margin: '8px 0 0', fontWeight: 650 }}>Business setup</h1>
          </div>
          <a className="bp-btn" href="/ops" style={{ fontSize: 13 }}>
            Dashboard
          </a>
        </header>

        {busy ? (
          <div className="bp-card">Loading setup...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(260px, 0.8fr)', gap: 18 }}>
            <section className="bp-card" style={{ padding: 22 }}>
              <div style={{ color: 'var(--muted-strong)', fontSize: 13, marginBottom: 6 }}>{email}</div>
              <h2 style={{ fontSize: 18, margin: '0 0 18px', fontWeight: 650 }}>
                {organization ? 'Business profile' : 'Create your business profile'}
              </h2>

              <form onSubmit={createOrganization} style={{ display: 'grid', gap: 14 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
                  Business name
                  <input
                    className="bp-input"
                    value={businessName}
                    disabled={!!organization || saving}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Example Cafe"
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
                    Timezone
                    <input
                      className="bp-input"
                      value={timezone}
                      disabled={!!organization || saving}
                      onChange={(e) => setTimezone(e.target.value)}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
                    Currency
                    <input
                      className="bp-input"
                      value={currencyCode}
                      disabled={!!organization || saving}
                      maxLength={3}
                      onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                    />
                  </label>
                </div>

                {!organization && (
                  <button className="bp-btn bp-btn--primary" disabled={saving || !businessName.trim()}>
                    {saving ? 'Creating...' : 'Create business'}
                  </button>
                )}
              </form>

              {message && <p style={{ color: '#95d5a8', fontSize: 13, marginTop: 14 }}>{message}</p>}
              {error && <p style={{ color: '#e58080', fontSize: 13, marginTop: 14 }}>{error}</p>}
            </section>

            <aside className="bp-card" style={{ padding: 22 }}>
              <h2 style={{ fontSize: 16, margin: '0 0 14px', fontWeight: 650 }}>Launch checklist</h2>
              {nextStep && (
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 12,
                    fontSize: 13,
                    color: 'var(--muted)',
                  }}
                >
                  Next: {nextStep.replace(/_/g, ' ')}
                </div>
              )}
              <div style={{ display: 'grid', gap: 10 }}>
                {steps.map(([label, complete]) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 0',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 13,
                    }}
                  >
                    <span>{label}</span>
                    <span style={{ color: complete ? '#95d5a8' : 'var(--muted-strong)' }}>
                      {complete ? 'Done' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
