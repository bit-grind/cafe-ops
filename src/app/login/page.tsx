'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setMsg(error.message)
    else window.location.href = '/ops'
  }

  return (
    <div style={{ maxWidth: 420, margin: '48px auto', fontFamily: 'system-ui' }}>
      <h1>Cafe Ops</h1>
      <p>Sign in</p>

      <form onSubmit={signIn}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 10 }}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 10 }}
        />
        <button disabled={busy} style={{ width: '100%', padding: 10 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {msg && <p style={{ color: 'crimson' }}>{msg}</p>}
    </div>
  )
}
