'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BpHeader from '@/components/BpHeader'
import { supabase } from '@/lib/supabaseClient'
import { getAllowedTabs } from '@/lib/permissions'

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
  const router = useRouter()
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

  const [invoiceCount, setInvoiceCount] = useState<number | null>(null)

  const [view, setView] = useState<'users' | 'suppliers'>('users')

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

  async function loadInvoiceCount() {
    try {
      const res = await fetch('/api/extract-lines/batch', { headers: await authHeaders() })
      const json = await res.json()
      if (res.ok) setInvoiceCount(Number(json.completed ?? 0))
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    async function init() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        router.replace('/login')
        return
      }
      const userEmail = sessionData.session.user.email ?? null
      setEmail(userEmail)
      setCurrentUserId(sessionData.session.user.id)

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
        router.replace('/ops')
        return
      }
      await loadUsers()
      await loadInvoiceCount()
      setLoading(false)
    }
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

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

  if (loading) {
    return (
      <>
        <BpHeader email={email} onSignOut={signOut} activeTab="admin" allowedTabs={getAllowedTabs({ isAdmin: true, isGuest: false, isKitchen: false })} />
        <main className="bp-container" style={{ padding: 24 }}>
          <div style={{ opacity: 0.6 }}>Loading…</div>
        </main>
      </>
    )
  }

  return (
    <>
      <BpHeader email={email} onSignOut={signOut} activeTab="admin" allowedTabs={getAllowedTabs({ isAdmin: true, isGuest: false, isKitchen: false })} />
      <main className="bp-container" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Admin</h1>

        <div
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 20,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {(['users', 'suppliers'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: view === v ? '2px solid #fff' : '2px solid transparent',
                color: view === v ? '#fff' : '#888',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                textTransform: 'capitalize',
                marginBottom: -1,
              }}
            >
              {v}
            </button>
          ))}
        </div>

        {view === 'users' && (
        <>
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
                                className="bp-input"
                                style={{ padding: '6px 10px', fontSize: 12, width: 'auto', cursor: busy ? 'not-allowed' : 'pointer' }}
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

        <section className="bp-card" style={{ padding: 20, marginTop: 24 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--muted-strong)',
            }}
          >
            Invoices imported
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, marginTop: 8 }}>
            {invoiceCount === null ? '—' : invoiceCount.toLocaleString()}
          </div>
        </section>
        </>
        )}

        {view === 'suppliers' && <SuppliersPanel />}
      </main>
    </>
  )
}

type SupplierCandidate = {
  contactName: string
  invoiceCount: number
  lastInvoiceDate: string | null
  selected: boolean
}

function SuppliersPanel() {
  const [contacts, setContacts] = useState<SupplierCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await supabase.auth.getSession()
        const res = await fetch('/api/admin/suppliers', {
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        })
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) setError(json.error ?? 'Failed to load suppliers')
        else setContacts(json.contacts ?? [])
      } catch {
        if (!cancelled) setError('Failed to load suppliers')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  async function toggle(contactName: string, selected: boolean) {
    setError(null)
    setPending((prev) => new Set(prev).add(contactName))
    setContacts((prev) =>
      prev.map((c) => (c.contactName === contactName ? { ...c, selected } : c)),
    )
    try {
      const { data } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/suppliers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.session?.access_token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contactName, selected }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? 'Failed to save')
        setContacts((prev) =>
          prev.map((c) =>
            c.contactName === contactName ? { ...c, selected: !selected } : c,
          ),
        )
      }
    } catch {
      setError('Failed to save')
      setContacts((prev) =>
        prev.map((c) =>
          c.contactName === contactName ? { ...c, selected: !selected } : c,
        ),
      )
    } finally {
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(contactName)
        return next
      })
    }
  }

  const selectedCount = contacts.filter((c) => c.selected).length

  return (
    <section className="bp-card" style={{ padding: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Kitchen suppliers</h2>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 16, maxWidth: 560 }}>
        Tick a contact to count it as a kitchen supplier. Ticked suppliers appear
        on the Suppliers page, count toward Kitchen costs, and have their invoice
        line items extracted automatically.
      </div>

      {error && (
        <div style={{ color: '#c77070', fontSize: 12, marginBottom: 12 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ opacity: 0.6, fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
            {selectedCount} of {contacts.length} selected
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {contacts.map((c) => {
              const isPending = pending.has(c.contactName)
              return (
                <label
                  key={c.contactName}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '20px 1fr auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '9px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.08)',
                    cursor: isPending ? 'wait' : 'pointer',
                    opacity: isPending ? 0.5 : 1,
                    background: c.selected ? 'rgba(255,255,255,0.03)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={c.selected}
                    disabled={isPending}
                    onChange={(e) => toggle(c.contactName, e.target.checked)}
                  />
                  <span style={{ fontSize: 13 }}>{c.contactName}</span>
                  <span style={{ fontSize: 11, opacity: 0.5, whiteSpace: 'nowrap' }}>
                    {c.invoiceCount} {c.invoiceCount === 1 ? 'invoice' : 'invoices'}
                  </span>
                </label>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
