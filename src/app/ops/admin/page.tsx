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
  const [newRole, setNewRole] = useState<'admin' | 'guest' | 'kitchen'>('admin')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Batch extraction state
  const [extractPending, setExtractPending] = useState<Array<{
    invoiceId: string; supplier: string; invoiceNumber: string | null
  }>>([])
  const [extractTotal, setExtractTotal] = useState(0)
  const [extractProcessed, setExtractProcessed] = useState(0)
  const [extracting, setExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState(0)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const extractAbortRef = { current: false }

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
      loadExtractionStatus()
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
    setNewRole('admin')
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

  async function updateUserRole(id: string, newRole: 'admin' | 'guest' | 'kitchen') {
    setBusy(true)
    setMsg(null)
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ role: newRole }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) {
      setMsg(json.error ?? 'Failed to update user role')
      return
    }
    // Update the detail view with the new role
    if (detail && detail.user.id === id) {
      setDetail({
        ...detail,
        user: { ...detail.user, role: newRole },
      })
    }
    // Update the users list
    await loadUsers()
  }

  async function loadExtractionStatus() {
    try {
      const res = await fetch('/api/extract-lines/batch', { headers: await authHeaders() })
      const json = await res.json()
      if (res.ok) {
        setExtractPending(json.bills ?? [])
        setExtractTotal(json.total ?? 0)
        setExtractProcessed(json.processed ?? 0)
      }
    } catch { /* non-fatal */ }
  }

  async function runBatchExtraction() {
    setExtracting(true)
    setExtractProgress(0)
    extractAbortRef.current = false
    const pending = [...extractPending]
    let done = 0
    let failed = 0
    for (const bill of pending) {
      if (extractAbortRef.current) break
      try {
        const res = await fetch('/api/extract-lines', {
          method: 'POST',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ invoiceId: bill.invoiceId }),
        })
        if (!res.ok) {
          const json = await res.json()
          console.error(`Failed ${bill.invoiceId}:`, json.error)
          failed++
        }
      } catch {
        failed++
      }
      done++
      setExtractProgress(done)
      setExtractMsg(`Processing ${done}/${pending.length}${failed ? ` (${failed} failed)` : ''}`)
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300))
    }
    setExtractMsg(`Done! Processed ${done} invoice${done !== 1 ? 's' : ''}${failed ? `, ${failed} failed` : ''}.`)
    setExtracting(false)
    await loadExtractionStatus()
  }

  if (loading) {
    return (
      <>
        <BpHeader email={email} onSignOut={signOut} activeTab="admin" allowedTabs={['dashboard', 'ask', 'bills', 'admin']} />
        <main className="bp-container" style={{ padding: 24 }}>
          <div style={{ opacity: 0.6 }}>Loading…</div>
        </main>
      </>
    )
  }

  return (
    <>
      <BpHeader email={email} onSignOut={signOut} activeTab="admin" allowedTabs={['dashboard', 'ask', 'bills', 'admin']} />
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
              onChange={(e) => setNewRole(e.target.value as 'admin' | 'guest' | 'kitchen')}
            >
              <option value="admin">admin (full access)</option>
              <option value="guest">guest (read-only Ask AI)</option>
              <option value="kitchen">kitchen (Bills only)</option>
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

                            <div style={{ opacity: 0.5 }}>Role</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <select
                                value={detail.user.role}
                                onChange={(e) => updateUserRole(detail.user.id, e.target.value as 'admin' | 'guest' | 'kitchen')}
                                disabled={busy}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  border: '1px solid #333',
                                  background: '#111',
                                  color: '#ccc',
                                  fontSize: 12,
                                  cursor: busy ? 'not-allowed' : 'pointer',
                                }}
                              >
                                <option value="admin">admin (full access)</option>
                                <option value="guest">guest (read-only Ask AI)</option>
                                <option value="kitchen">kitchen (Bills only)</option>
                              </select>
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

        <section className="bp-card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            Invoice line extraction
          </h2>
          <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>
            Use AI to read line items from supplier invoice PDFs and make them searchable.
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 16 }}>
            {extractTotal > 0
              ? `${extractProcessed} of ${extractTotal} invoices processed • ${extractPending.length} pending`
              : 'Loading extraction status…'}
          </div>

          {extractPending.length > 0 && !extracting && (
            <button
              onClick={runBatchExtraction}
              className="bp-btn"
              style={{ fontSize: 13, marginBottom: 12 }}
            >
              Extract {extractPending.length} pending invoice{extractPending.length !== 1 ? 's' : ''}
            </button>
          )}

          {extracting && (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                height: 6,
                borderRadius: 3,
                background: '#222',
                overflow: 'hidden',
                marginBottom: 8,
              }}>
                <div style={{
                  height: '100%',
                  width: `${extractPending.length > 0 ? (extractProgress / extractPending.length) * 100 : 0}%`,
                  background: '#4cc77d',
                  borderRadius: 3,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <button
                onClick={() => { extractAbortRef.current = true }}
                className="bp-btn"
                style={{ fontSize: 12 }}
              >
                Stop
              </button>
            </div>
          )}

          {extractMsg && (
            <div style={{ fontSize: 12, opacity: 0.7 }}>{extractMsg}</div>
          )}

          {extractPending.length === 0 && extractTotal > 0 && !extracting && (
            <div style={{ fontSize: 12, color: '#4cc77d' }}>
              All invoices have been processed.
            </div>
          )}
        </section>
      </main>
    </>
  )
}
