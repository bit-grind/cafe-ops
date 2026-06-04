'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useBranding } from '@/lib/useBranding'

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
    const guestEmail = process.env.NEXT_PUBLIC_GUEST_LOGIN_EMAIL
    if (trimmedEmail === 'guest' && !guestEmail) {
      setBusy(false)
      setMsg('Guest login is not configured.')
      return
    }
    const resolvedEmail = trimmedEmail === 'guest' ? guestEmail! : trimmedEmail
    const { error } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password })
    setBusy(false)
    if (error) setMsg('Invalid email or password.')
    else window.location.href = '/ops'
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
          <label className="sr-only" htmlFor="login-email">Email</label>
          <input
            id="login-email"
            className="bp-input"
            placeholder="Email"
            autoComplete="email"
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
