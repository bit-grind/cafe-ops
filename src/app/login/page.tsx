'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useBranding } from '@/lib/useBranding'
import { getLandingHref, type AppTab } from '@/lib/permissions'

export default function LoginPage() {
  const branding = useBranding()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const trimmedEmail = email.trim()
    const loginName = trimmedEmail.toLowerCase()
    const guestEmail = process.env.NEXT_PUBLIC_GUEST_LOGIN_EMAIL
    const teamEmail = process.env.NEXT_PUBLIC_TEAM_LOGIN_EMAIL
    if (loginName === 'guest' && !guestEmail) {
      setBusy(false)
      setMsg('Guest login is not configured.')
      return
    }
    if (loginName === 'team' && !teamEmail) {
      setBusy(false)
      setMsg('Team login is not configured.')
      return
    }
    const resolvedEmail = loginName === 'guest'
      ? guestEmail!
      : loginName === 'team'
        ? teamEmail!
        : trimmedEmail
    const { data, error } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password })
    setBusy(false)
    if (error || !data.session) {
      setMsg('Invalid email or password.')
      return
    }

    const meRes = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    }).catch(() => null)
    if (!meRes?.ok) {
      window.location.href = '/ops'
      return
    }
    const me = await meRes.json() as { allowedTabs?: AppTab[] }
    window.location.href = getLandingHref(me.allowedTabs ?? [])
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
      }}
    >
      <div className="bp-card" style={{ width: '100%', maxWidth: 380, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.logoSrc}
            alt={`${branding.displayName} logo`}
            width={72}
            height={72}
            style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 20 }}
          />
        </div>
        <div
          style={{
            fontWeight: 700,
            letterSpacing: '0.1em',
            fontSize: 13,
            textAlign: 'center',
            textTransform: 'uppercase',
          }}
        >
          {branding.displayName}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: 'var(--muted-strong)',
            textAlign: 'center',
            marginTop: 4,
            textTransform: 'uppercase',
          }}
        >
          {branding.subtitle}
        </div>

        <h1
          style={{
            fontSize: 18,
            fontWeight: 600,
            margin: '24px 0 16px',
            textAlign: 'center',
          }}
        >
          Sign in
        </h1>

        <form onSubmit={signIn} style={{ display: 'grid', gap: 10 }}>
          <label className="sr-only" htmlFor="login-email">Email or username</label>
          <input
            id="login-email"
            className="bp-input"
            placeholder="Email or username"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="sr-only" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            className="bp-input"
            placeholder="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            disabled={busy}
            className="bp-btn"
            style={{ marginTop: 4, fontWeight: 600 }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {msg && (
          <p
            role="alert"
            style={{ color: '#e58080', fontSize: 13, marginTop: 14, textAlign: 'center' }}
          >
            {msg}
          </p>
        )}
      </div>
    </main>
  )
}
