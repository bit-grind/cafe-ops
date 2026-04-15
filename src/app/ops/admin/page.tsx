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

type UserDetail = {
  user: User & { email_confirmed_at: string | null }
  queries: Array<{
    id: number
    question: string
    answer: string | null
    created_at: string
  }>
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'user' | 'guest'>('user')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  async function toggleDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setDetail(null)
      return
    }
    setExpandedId(id)
    setDetail(null)
    setDetailLoading(true)
    const res = await fetch(`/api/admin/users/${id}`, { headers: await authHeaders() })
    const json = await res.json()
    setDetailLoading(false)
    if (!res.ok) {
      setMsg(json.error ?? 'Failed to load user detail')
      setExpandedId(null)
      return
    }
    setDetail(json)
  }

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
      setCurrentUserId(sessionData.session.user.id)

      // Ask the server whether this user is the admin — admin email lives
      // in a server-only env var.
      let isAdmin = false
      try {
        const meRes = await fetch('/api/me', {
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        })
        if (meRes.ok) {
          const me = await meRes.json()
          isAdmin = !!me.isAdmin
        }
      } catch { /* treat as non-admin */ }

      if (!isAdmin) {
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
            {users.map((u) => {
              const isExpanded = expandedId === u.id
              return (
                <div
                  key={u.id}
                  style={{
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                  }}
                >
                  <div
                    onClick={() => toggleDetail(u.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 100px 140px 100px',
                      gap: 12,
                      alignItems: 'center',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent',
                    }}
                  >
                    <div style={{ fontSize: 13 }}>
                      <span style={{ marginRight: 8, opacity: 0.5 }}>{isExpanded ? '▾' : '▸'}</span>
                      {u.email ?? '(no email)'}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>{u.role}</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleDateString()
                        : 'never'}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteUser(u.id, u.email)
                      }}
                      disabled={busy || u.id === currentUserId}
                      className="bp-btn"
                      style={{ fontSize: 12 }}
                    >
                      Delete
                    </button>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        padding: 16,
                        fontSize: 12,
                      }}
                    >
                      {detailLoading && <div style={{ opacity: 0.6 }}>Loading…</div>}
                      {detail && detail.user.id === u.id && (
                        <>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '140px 1fr',
                              rowGap: 6,
                              columnGap: 12,
                              marginBottom: 16,
                            }}
                          >
                            <div style={{ opacity: 0.5 }}>User ID</div>
                            <div style={{ fontFamily: 'monospace', fontSize: 11 }}>{detail.user.id}</div>

                            <div style={{ opacity: 0.5 }}>Created</div>
                            <div>{new Date(detail.user.created_at).toLocaleString()}</div>

                            <div style={{ opacity: 0.5 }}>Last sign in</div>
                            <div>
                              {detail.user.last_sign_in_at
                                ? new Date(detail.user.last_sign_in_at).toLocaleString()
                                : 'never'}
                            </div>

                            <div style={{ opacity: 0.5 }}>Email confirmed</div>
                            <div>
                              {detail.user.email_confirmed_at
                                ? new Date(detail.user.email_confirmed_at).toLocaleString()
                                : 'no'}
                            </div>
                          </div>

                          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                            Ask AI queries ({detail.queries.length})
                          </div>
                          {detail.queries.length === 0 ? (
                            <div style={{ opacity: 0.5 }}>No queries yet.</div>
                          ) : (
                            <div style={{ display: 'grid', gap: 10 }}>
                              {detail.queries.map((q) => (
                                <div
                                  key={q.id}
                                  style={{
                                    padding: 10,
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: 4,
                                  }}
                                >
                                  <div style={{ opacity: 0.5, fontSize: 11, marginBottom: 4 }}>
                                    {new Date(q.created_at).toLocaleString()}
                                  </div>
                                  <div style={{ marginBottom: 6 }}>
                                    <span style={{ opacity: 0.5 }}>Q:</span> {q.question}
                                  </div>
                                  {q.answer && (
                                    <div style={{ opacity: 0.75, whiteSpace: 'pre-wrap' }}>
                                      <span style={{ opacity: 0.5 }}>A:</span> {q.answer}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </>
  )
}
