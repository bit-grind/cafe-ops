'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import MetricCard from '@/components/MetricCard'
import { supabase } from '@/lib/supabaseClient'
import { TRAINING_MODULES } from '@/lib/training/content'
import { buildQr } from '@/lib/training/qr'

export type Trainee = {
  id: string
  name: string
  tokenHint: string
  status: string
  createdAt: string
  startedAt: string | null
  lastSeenAt: string | null
  signedOffAt: string | null
  signedOffName: string | null
  contentVersion: string | null
  completed: Array<{ moduleId: string; bestScore: number; total: number; completedAt: string }>
}

const TOTAL_MODULES = TRAINING_MODULES.length

function when(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}


/**
 * The invite link as a scannable code, so a new starter can point their phone
 * at the manager's screen instead of waiting for a message.
 *
 * Rendered locally from the token we already hold — never by sending the link
 * to a QR web service, which would leak a bearer credential to a third party.
 * Always dark-on-white with a quiet zone, whatever the surrounding theme:
 * inverted or margin-less codes are the two classic ways to make a QR that
 * looks right and does not scan.
 */
function InviteQr({ link, name }: { link: string; name: string }) {
  const qr = useMemo(() => buildQr(link), [link])
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 10,
        padding: 8,
        flex: '0 0 auto',
        lineHeight: 0,
      }}
    >
      <svg
        width={148}
        height={148}
        viewBox={`0 0 ${qr.viewBoxSize} ${qr.viewBoxSize}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`QR code for ${name}'s training invite link`}
      >
        <rect width={qr.viewBoxSize} height={qr.viewBoxSize} fill="#fff" />
        <path d={qr.path} fill="#000" />
      </svg>
    </div>
  )
}

/**
 * Manager view of staff onboarding. Replaces the standalone passcode-gated
 * "Manager Dashboard.html" the course originally shipped with — access is the
 * caller's ops session, so there's no second password to share.
 */
export default function TrainingRoster({ isAdmin }: { isAdmin: boolean }) {
  const [loading, setLoading] = useState(true)
  const [trainees, setTrainees] = useState<Trainee[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [newName, setNewName] = useState('')
  // The invite link is returned once, at creation, and never again.
  const [freshLink, setFreshLink] = useState<{ name: string; link: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const authHeaders = useCallback(async (extra?: Record<string, string>): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession()
    return {
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      ...(extra ?? {}),
    }
  }, [])

  // Bumped after every mutation to re-run the loader below.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(key => key + 1), [])

  useEffect(() => {
    let alive = true
    async function load() {
      const res = await fetch('/api/training/trainees', { headers: await authHeaders() })
      const json = await res.json().catch(() => ({}))
      if (!alive) return
      if (!res.ok) {
        setMsg(json.error ?? 'Failed to load trainees')
        setLoading(false)
        return
      }
      setTrainees(json.trainees ?? [])
      setLoading(false)
    }
    void load()
    return () => { alive = false }
  }, [authHeaders, reloadKey])

  async function addTrainee(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) {
      setMsg('Enter a name first')
      return
    }
    setBusy(true)
    setMsg(null)
    const res = await fetch('/api/training/trainees', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ fullName: name }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setMsg(json.error ?? 'Failed to add trainee')
      return
    }
    setNewName('')
    setCopied(false)
    setFreshLink({ name, link: json.inviteLink })
    reload()
  }

  async function act(id: string, action: string, name?: string) {
    setBusy(true)
    setMsg(null)
    const res = await fetch(`/api/training/trainees/${id}`, {
      method: 'PATCH',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action, fullName: name }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setMsg(json.error ?? 'Action failed')
      return
    }
    if (action === 'reissue' && json.inviteLink) {
      const trainee = trainees.find(t => t.id === id)
      setCopied(false)
      setFreshLink({ name: trainee?.name ?? 'Trainee', link: json.inviteLink })
    }
    reload()
  }

  async function removeTrainee(id: string, name: string) {
    if (!window.confirm(`Delete ${name} and their training record permanently?`)) return
    setBusy(true)
    setMsg(null)
    const res = await fetch(`/api/training/trainees/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    setBusy(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setMsg(json.error ?? 'Failed to delete trainee')
      return
    }
    reload()
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setMsg('Copy failed — select the link and copy it manually')
    }
  }

  const active = trainees.filter(t => t.status === 'active')
  const allDone = trainees.filter(t => t.completed.length >= TOTAL_MODULES).length
  const signedOff = trainees.filter(t => t.signedOffAt).length

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <MetricCard label="In training" value={String(active.length)} foot="Active links" />
        <MetricCard label="All modules done" value={String(allDone)} foot={`of ${trainees.length} people`} />
        <MetricCard label="Signed off" value={String(signedOff)} foot="Onboarding complete" />
      </div>

      <div className="bp-card">
        <div className="bp-metric__label" style={{ marginBottom: 12 }}>Add a new starter</div>
        <form onSubmit={addTrainee} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="bp-input"
            style={{ flex: '1 1 220px', width: 'auto' }}
            placeholder="Full name"
            autoComplete="off"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <button type="submit" className="bp-btn bp-btn--primary" disabled={busy}>
            Create invite link
          </button>
        </form>

        {freshLink && (
          <div
            style={{
              marginTop: 14,
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              Give this to <strong>{freshLink.name}</strong> — they can scan the code, or you
              can send them the link. It’s shown once; it can’t be looked up later, only reissued.
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <InviteQr link={freshLink.link} name={freshLink.name} />

              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono), monospace',
                    fontSize: 12,
                    wordBreak: 'break-all',
                    color: 'var(--muted)',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 8,
                    padding: '10px 12px',
                  }}
                >
                  {freshLink.link}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="bp-btn" onClick={() => void copyLink(freshLink.link)}>
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                  <button type="button" className="bp-btn" onClick={() => { setFreshLink(null); setCopied(false) }}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {msg && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>{msg}</div>}
      </div>

      {loading ? (
        <div className="bp-card" style={{ color: 'var(--muted-strong)' }}>Loading trainees…</div>
      ) : trainees.length === 0 ? (
        <div className="bp-card" style={{ color: 'var(--muted-strong)' }}>
          No one is in training yet. Add a new starter above and send them the link.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {trainees.map(trainee => {
            const done = trainee.completed.length
            const percent = Math.round((done / TOTAL_MODULES) * 100)
            const expanded = expandedId === trainee.id
            const revoked = trainee.status !== 'active'
            return (
              <div key={trainee.id} className="bp-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 16 }}>{trainee.name}</strong>
                  {trainee.signedOffAt ? (
                    <span className="bp-chip" style={{ cursor: 'default' }}>Signed off {when(trainee.signedOffAt)}</span>
                  ) : (
                    <span className="bp-chip" style={{ cursor: 'default' }}>{done} / {TOTAL_MODULES}</span>
                  )}
                  {revoked && (
                    <span className="bp-chip" style={{ cursor: 'default' }}>Link revoked</span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted-strong)' }}>
                    Last active {when(trainee.lastSeenAt)}
                  </span>
                </div>

                <div
                  style={{
                    height: 3,
                    background: 'rgba(255,255,255,0.10)',
                    borderRadius: 2,
                    margin: '12px 0 8px',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ width: `${percent}%`, height: '100%', background: 'var(--foreground)' }} />
                </div>

                <div style={{ fontSize: 12, color: 'var(--muted-strong)' }}>
                  {done} of {TOTAL_MODULES} modules complete
                  {trainee.startedAt ? ` · started ${when(trainee.startedAt)}` : ' · not started'}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                  {TRAINING_MODULES.map(module => {
                    const result = trainee.completed.find(c => c.moduleId === module.id)
                    return (
                      <span
                        key={module.id}
                        className="bp-chip"
                        style={{
                          cursor: 'default',
                          opacity: result ? 1 : 0.45,
                          borderColor: result ? 'rgba(255,255,255,0.32)' : undefined,
                          color: result ? 'var(--foreground)' : undefined,
                        }}
                        title={result ? `${result.bestScore}/${result.total} on ${when(result.completedAt)}` : 'Not yet done'}
                      >
                        {result ? '✓' : '·'} {module.title}
                      </span>
                    )
                  })}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="bp-btn"
                    style={{ fontSize: 13 }}
                    onClick={() => setExpandedId(expanded ? null : trainee.id)}
                  >
                    {expanded ? 'Hide options' : 'Options'}
                  </button>
                  {expanded && (
                    <>
                      <button
                        type="button"
                        className="bp-btn"
                        style={{ fontSize: 13 }}
                        disabled={busy}
                        onClick={() => void act(trainee.id, 'reissue')}
                      >
                        Reissue link
                      </button>
                      <button
                        type="button"
                        className="bp-btn"
                        style={{ fontSize: 13 }}
                        disabled={busy}
                        onClick={() => void act(trainee.id, revoked ? 'restore' : 'revoke')}
                      >
                        {revoked ? 'Restore access' : 'Revoke link'}
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          className="bp-btn"
                          style={{ fontSize: 13 }}
                          disabled={busy}
                          onClick={() => void removeTrainee(trainee.id, trainee.name)}
                        >
                          Delete
                        </button>
                      )}
                      <span style={{ fontSize: 12, color: 'var(--muted-strong)', alignSelf: 'center' }}>
                        Link ends …{trainee.tokenHint}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
