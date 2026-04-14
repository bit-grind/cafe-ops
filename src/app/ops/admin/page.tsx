'use client'

import { useEffect, useState } from 'react'
import BpHeader from '@/components/BpHeader'
import { supabase } from '@/lib/supabaseClient'

type User = {
  id: string
  email: string | null
  role: string
  created_at: string
  last_sign_in_at: string | null
}

const ADMIN_EMAIL = 'admin@example.com'

export default function AdminPage() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'user' | 'guest'>('user')

  async function authHeaders(extra?: Record<string, string>): Promise<HeadersInit> {
    const { data } = await supabase.auth.getSession()
    return {
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      ...(extra ?? {}),
    }
  }

  async function loadUsers() {
    const res = await fetch('/api/admin/users', { headers: await authHeaders() })
    const json = await res.json()
    if (!res.ok) {
      setMsg(json.error ?? 'Failed to load users')
      return
    }
    setUsers(json.users)
  }

  useEffect(() => {
    async function init() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/login'
        return
      }
      const userEmail = sessionData.session.user.email ?? null
      setEmail(userEmail)
      if (userEmail !== ADMIN_EMAIL) {
        window.location.href = '/ops'
        return
      }
      await loadUsers()
      setLoading(false)
    }
    init()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) {
      setMsg(json.error ?? 'Failed to create user')
      return
    }
    setMsg(`Created ${json.user.email}`)
    setNewEmail('')
    setNewPassword('')
    setNewRole('user')
    await loadUsers()
  }

  async function deleteUser(id: string, userEmail: string | null) {
    if (!confirm(`Delete ${userEmail ?? id}? This cannot be undone.`)) return
    setBusy(true)
    setMsg(null)
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) {
      setMsg(json.error ?? 'Failed to delete user')
      return
    }
    await loadUsers()
  }

  if (loading) {
    return (
      <>
        <BpHeader email={email} onSignOut={signOut} activeTab="admin" isAdmin />
        <main className="bp-container" style={{ padding: 24 }}>
          <div style={{ opacity: 0.6 }}>Loading…</div>
        </main>
      </>
    )
  }

  return (
    <>
      <BpHeader email={email} onSignOut={signOut} activeTab="admin" isAdmin />
      <main className="bp-container" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 20 }}>User management</h1>

        <section className="bp-card" style={{ padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Create user</h2>
          <form onSubmit={createUser} style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
            <input
              className="bp-input"
              placeholder="email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <input
              className="bp-input"
              placeholder="password (12+ characters)"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={12}
            />
            <select
              className="bp-input"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'user' | 'guest')}
            >
              <option value="user">user (full access)</option>
              <option value="guest">guest (read-only Ask AI)</option>
            </select>
            <button type="submit" disabled={busy} className="bp-btn">
              {busy ? 'Working…' : 'Create user'}
            </button>
          </form>
        </section>

        {msg && <div style={{ marginBottom: 16, fontSize: 13, opacity: 0.8 }}>{msg}</div>}

        <section className="bp-card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            Users ({users.length})
          </h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 140px 100px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 12px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6,
                }}
              >
                <div style={{ fontSize: 13 }}>{u.email ?? '(no email)'}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{u.role}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {u.last_sign_in_at
                    ? new Date(u.last_sign_in_at).toLocaleDateString()
                    : 'never'}
                </div>
                <button
                  onClick={() => deleteUser(u.id, u.email)}
                  disabled={busy || u.email === ADMIN_EMAIL}
                  className="bp-btn"
                  style={{ fontSize: 12 }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
