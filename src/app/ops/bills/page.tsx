'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import BpHeader from '@/components/BpHeader'
import { supabase } from '@/lib/supabaseClient'

type Bill = {
  invoiceID: string
  invoiceNumber: string | null
  reference: string | null
  contactName: string
  date: string
  dueDate: string | null
  status: string
  total: number
  amountDue: number
  amountPaid: number
  currencyCode: string
}

type Attachment = {
  attachmentID: string
  fileName: string
  mimeType: string
  contentLength: number
}

// Suppliers to show on the Bills dashboard. Each entry has a short display
// label and a list of lowercase keywords used to match Xero contact names.
// Matching is substring-based after stripping apostrophes, so "big michael"
// will match "Big Michael's Fruit & Vegetables" etc.
//
// `excludeInvoicePrefixes` is an optional case-insensitive list of invoice
// number prefixes to hide from that supplier's tab (e.g. Southside Milk's
// "RB…" invoices aren't supplier bills we care about here).
type SupplierDef = {
  label: string
  keywords: string[]
  excludeInvoicePrefixes?: string[]
}

const SUPPLIERS: SupplierDef[] = [
  { label: 'Brasserie',        keywords: ['brasserie'] },
  { label: 'Superior',         keywords: ['superior'] },
  { label: "Big Michael's",    keywords: ['big michael'] },
  { label: "Michael's Meats",  keywords: ['michaels meats', 'michael meats'] },
  { label: 'A La Carte',       keywords: ['a la carte'] },
  { label: 'Breadtop',         keywords: ['breadtop', 'quality factory'] },
  { label: 'Filla',            keywords: ['filla'] },
  { label: 'Southside Milk',   keywords: ['southside milk', 'southside'], excludeInvoicePrefixes: ['RB'] },
  { label: 'APAK',             keywords: ['apak'] },
  { label: 'Bagel Boys',       keywords: ['bagel boys', 'bagel boy'] },
  { label: 'Cravve Chocolate', keywords: ['cravve'] },
  { label: 'Providore',        keywords: ['providore'] },
  { label: 'Bask & Co',        keywords: ['bask'] },
]

function normalise(s: string) {
  return s.toLowerCase().replace(/['']/g, '').replace(/\s+/g, ' ').trim()
}

function matchSupplierLabel(contactName: string): string | null {
  const norm = normalise(contactName)
  for (const s of SUPPLIERS) {
    if (s.keywords.some(k => norm.includes(normalise(k)))) return s.label
  }
  return null
}

function money(n: number, ccy = 'AUD') {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: ccy, maximumFractionDigits: 2 }).format(n || 0)
}
function fmtDate(s: string | null) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export default function BillsPage() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [connected, setConnected] = useState<boolean | null>(null)
  const [bills, setBills] = useState<Bill[]>([])
  const [totalScanned, setTotalScanned] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  // Filters
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [activeSupplier, setActiveSupplier] = useState<string>(SUPPLIERS[0].label)
  const [dateOpen, setDateOpen] = useState(false)
  const dateRef = useRef<HTMLDivElement>(null)

  // Detail modal
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [activeAttachmentIdx, setActiveAttachmentIdx] = useState(0)
  const [attachmentBlobUrl, setAttachmentBlobUrl] = useState<string | null>(null)
  const [attachmentMime, setAttachmentMime] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession()
      if (!data.session) { window.location.href = '/login'; return }
      const u = data.session.user
      setEmail(u.email ?? null)

      // Ask the server whether we're admin — admin email lives in a
      // server-only env var and is never sent to the browser.
      try {
        const meRes = await fetch('/api/me', {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        })
        if (meRes.ok) {
          const me = await meRes.json()
          setIsAdmin(!!me.isAdmin)
        }
      } catch { /* non-fatal */ }

      setLoading(false)

      // Read callback flash messages
      const params = new URLSearchParams(window.location.search)
      if (params.get('xero_connected') === '1') {
        setFlash('Xero connected.')
        window.history.replaceState({}, '', '/ops/bills')
      } else if (params.get('xero_error')) {
        setError(`Xero connect failed: ${params.get('xero_error')}`)
        window.history.replaceState({}, '', '/ops/bills')
      }

      await loadBills()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadBills() {
    setBusy(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const qs = new URLSearchParams()
      if (dateFrom) qs.set('dateFrom', dateFrom)
      if (dateTo) qs.set('dateTo', dateTo)
      const res = await fetch(`/api/xero/bills?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const out = await res.json()
      if (!res.ok) {
        setError(out.error ?? 'Failed to load bills')
        setConnected(null)
      } else {
        setConnected(out.connected)
        setBills(out.bills ?? [])
        setTotalScanned(out.totalScanned ?? (out.bills?.length ?? 0))
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load bills'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  async function openBill(bill: Bill) {
    setSelectedBill(bill)
    setAttachments([])
    setActiveAttachmentIdx(0)
    setAttachmentBlobUrl(null)
    setAttachmentMime(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/xero/bills/${encodeURIComponent(bill.invoiceID)}/attachments`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const out = await res.json()
      if (!res.ok) {
        setDetailError(out.error ?? 'Failed to load attachments')
      } else {
        setAttachments(out.attachments ?? [])
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load attachments'
      setDetailError(msg)
    } finally {
      setDetailLoading(false)
    }
  }

  function closeBill() {
    if (attachmentBlobUrl) URL.revokeObjectURL(attachmentBlobUrl)
    setSelectedBill(null)
    setAttachments([])
    setActiveAttachmentIdx(0)
    setAttachmentBlobUrl(null)
    setAttachmentMime(null)
    setDetailError(null)
  }

  // Close modal on Escape
  useEffect(() => {
    if (!selectedBill) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeBill()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBill])

  // Close date popover on outside click
  useEffect(() => {
    if (!dateOpen) return
    function onClick(e: MouseEvent) {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) {
        setDateOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [dateOpen])

  // Whenever the active attachment changes, fetch its bytes as a blob URL so
  // an <iframe>/<img> can render it without needing to send auth headers.
  useEffect(() => {
    if (!selectedBill || attachments.length === 0) return
    const att = attachments[activeAttachmentIdx]
    if (!att) return
    let cancelled = false
    let createdUrl: string | null = null
    ;(async () => {
      // Clean up the previous blob URL
      if (attachmentBlobUrl) URL.revokeObjectURL(attachmentBlobUrl)
      setAttachmentBlobUrl(null)
      setAttachmentMime(null)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const url = `/api/xero/bills/${encodeURIComponent(selectedBill.invoiceID)}/attachments/${encodeURIComponent(att.fileName)}`
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        if (!res.ok) {
          if (!cancelled) setDetailError(`Failed to load attachment (${res.status})`)
          return
        }
        const blob = await res.blob()
        const mime = res.headers.get('content-type') ?? blob.type ?? att.mimeType
        createdUrl = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(createdUrl)
          return
        }
        setAttachmentBlobUrl(createdUrl)
        setAttachmentMime(mime)
      } catch (e: unknown) {
        if (!cancelled) setDetailError(e instanceof Error ? e.message : 'Attachment load failed')
      }
    })()
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBill, attachments, activeAttachmentIdx])

  async function connectXero() {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/xero/connect', {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    const out = await res.json()
    if (!res.ok || !out.url) {
      setError(out.error ?? 'Failed to start Xero connect')
      return
    }
    window.location.href = out.url
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // Group all loaded bills by matched supplier label. Any bill whose contact
  // isn't in the SUPPLIERS list is dropped. Per-supplier invoice-prefix
  // exclusions (e.g. Southside Milk "RB…") are applied here too.
  const bySupplier = useMemo(() => {
    const map = new Map<string, Bill[]>()
    const defsByLabel = new Map(SUPPLIERS.map(s => [s.label, s]))
    for (const s of SUPPLIERS) map.set(s.label, [])
    for (const b of bills) {
      const label = matchSupplierLabel(b.contactName)
      if (!label || !map.has(label)) continue
      const def = defsByLabel.get(label)
      if (def?.excludeInvoicePrefixes?.length) {
        const num = (b.invoiceNumber ?? '').toUpperCase()
        const excluded = def.excludeInvoicePrefixes.some(p => num.startsWith(p.toUpperCase()))
        if (excluded) continue
      }
      map.get(label)!.push(b)
    }
    return map
  }, [bills])

  const visibleBills = useMemo(
    () => bySupplier.get(activeSupplier) ?? [],
    [bySupplier, activeSupplier]
  )

  if (loading) return <div style={{ padding: 40, color: '#fff' }}>Loading…</div>

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} activeTab="bills" isAdmin={isAdmin} />

      <div className="bp-container" style={{ paddingTop: 24 }}>
        {connected === false ? (
          <div className="bp-card" style={{ padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Xero not connected</div>
            <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 16 }}>
              {isAdmin
                ? 'Connect your Xero org to start pulling supplier bills.'
                : 'An admin needs to connect Xero before bills can appear here.'}
            </div>
            {isAdmin && (
              <button onClick={connectXero} className="bp-btn" style={{ fontSize: 13 }}>
                Connect Xero
              </button>
            )}
            {error && <div style={{ color: '#c77070', fontSize: 12, marginTop: 12 }}>{error}</div>}
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 14,
            }}>
              <div style={{ fontWeight: 700, fontSize: 22 }}>{activeSupplier}</div>

              <div ref={dateRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setDateOpen(o => !o)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 20,
                    border: `1px solid ${(dateFrom || dateTo) ? '#555' : '#333'}`,
                    background: (dateFrom || dateTo) ? '#1a1a1a' : 'transparent',
                    color: (dateFrom || dateTo) ? '#fff' : '#999',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {dateFrom || dateTo
                    ? `${dateFrom ? fmtDate(dateFrom) : '…'} – ${dateTo ? fmtDate(dateTo) : '…'}`
                    : 'Date range'}
                  <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
                </button>

                {dateOpen && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    zIndex: 120,
                    background: '#121212',
                    border: '1px solid #2a2a2a',
                    borderRadius: 12,
                    padding: 14,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    minWidth: 260,
                  }}>
                    <Field label="From">
                      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
                    </Field>
                    <Field label="To">
                      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
                    </Field>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        onClick={() => { loadBills(); setDateOpen(false) }}
                        disabled={busy}
                        className="bp-btn"
                        style={{ fontSize: 13, padding: '8px 18px', flex: 1, opacity: busy ? 0.5 : 1 }}
                      >
                        {busy ? 'Loading…' : 'Apply'}
                      </button>
                      {(dateFrom || dateTo) && (
                        <button
                          onClick={() => {
                            setDateFrom(''); setDateTo('')
                            setTimeout(() => { loadBills(); setDateOpen(false) }, 0)
                          }}
                          style={{
                            fontSize: 12, background: 'none', border: '1px solid #333', color: '#888',
                            padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Supplier tabs */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 14,
              paddingBottom: 10,
              borderBottom: '1px solid #1e1e1e',
            }}>
              {SUPPLIERS.map(s => {
                const count = bySupplier.get(s.label)?.length ?? 0
                const isActive = s.label === activeSupplier
                return (
                  <button
                    key={s.label}
                    onClick={() => setActiveSupplier(s.label)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 18,
                      border: `1px solid ${isActive ? '#555' : '#262626'}`,
                      background: isActive ? '#1a1a1a' : 'transparent',
                      color: isActive ? '#fff' : (count === 0 ? '#444' : '#999'),
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {s.label}
                    <span style={{
                      fontSize: 10,
                      opacity: isActive ? 0.7 : 0.5,
                      fontWeight: 500,
                    }}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {flash && <div style={{ color: '#4cc77d', fontSize: 12, marginBottom: 10 }}>{flash}</div>}
            {error && <div style={{ color: '#c77070', fontSize: 12, marginBottom: 10 }}>{error}</div>}

            {/* Table */}
            <div className="bp-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#141414', color: '#888', textAlign: 'left' }}>
                      <Th>Date</Th>
                      <Th>Supplier</Th>
                      <Th>Invoice #</Th>
                      <Th right>Total</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleBills.length === 0 && !busy ? (
                      <tr>
                        <td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#555' }}>
                          {bills.length === 0 && totalScanned > 0
                            ? `Scanned ${totalScanned} bills — none have an attached invoice file in Xero.`
                            : bills.length === 0
                            ? 'No bills match those filters.'
                            : `No ${activeSupplier} bills with attachments in the scanned ${totalScanned} bills.`}
                        </td>
                      </tr>
                    ) : (
                      visibleBills.map(b => (
                        <tr
                          key={b.invoiceID}
                          onClick={() => openBill(b)}
                          style={{ borderTop: '1px solid #1e1e1e', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#141414')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Td>{fmtDate(b.date)}</Td>
                          <Td>{b.contactName}</Td>
                          <Td mono>{b.invoiceNumber ?? '—'}</Td>
                          <Td right>{money(b.total, b.currencyCode)}</Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {isAdmin && (
              <div style={{ marginTop: 14, fontSize: 11, opacity: 0.5 }}>
                <button
                  onClick={connectXero}
                  style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Reconnect Xero
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedBill && (
        <BillDetailModal
          bill={selectedBill}
          attachments={attachments}
          activeIdx={activeAttachmentIdx}
          onSelectAttachment={setActiveAttachmentIdx}
          blobUrl={attachmentBlobUrl}
          mime={attachmentMime}
          loading={detailLoading}
          error={detailError}
          onClose={closeBill}
        />
      )}
    </div>
  )
}

function BillDetailModal({
  bill,
  attachments,
  activeIdx,
  onSelectAttachment,
  blobUrl,
  mime,
  loading,
  error,
  onClose,
}: {
  bill: Bill
  attachments: Attachment[]
  activeIdx: number
  onSelectAttachment: (idx: number) => void
  blobUrl: string | null
  mime: string | null
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  const active = attachments[activeIdx] ?? null
  const isImage = mime?.startsWith('image/')
  const isPdf = mime === 'application/pdf' || active?.fileName.toLowerCase().endsWith('.pdf')

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4vh 20px',
        zIndex: 200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0d0d0d',
          border: '1px solid #222',
          borderRadius: 14,
          width: '100%',
          maxWidth: 1000,
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 16px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid #1e1e1e',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Supplier bill
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{bill.contactName}</div>
            <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>
              {bill.invoiceNumber ? `#${bill.invoiceNumber} · ` : ''}
              {fmtDate(bill.date)}
              {' · '}{money(bill.total, bill.currencyCode)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'none',
                border: '1px solid #333',
                color: '#888',
                borderRadius: 8,
                width: 30,
                height: 30,
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Attachment tabs (only if more than one) */}
        {attachments.length > 1 && (
          <div style={{
            display: 'flex',
            gap: 4,
            padding: '8px 22px',
            borderBottom: '1px solid #1e1e1e',
            overflowX: 'auto',
            flexShrink: 0,
          }}>
            {attachments.map((a, i) => (
              <button
                key={a.attachmentID}
                onClick={() => onSelectAttachment(i)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: `1px solid ${i === activeIdx ? '#555' : '#222'}`,
                  background: i === activeIdx ? '#1a1a1a' : 'transparent',
                  color: i === activeIdx ? '#fff' : '#888',
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {a.fileName}
              </button>
            ))}
          </div>
        )}

        {/* Viewer */}
        <div style={{
          flex: 1,
          minHeight: 0,
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
          {loading ? (
            <div style={{ color: '#555', fontSize: 13 }}>Loading attachments…</div>
          ) : error ? (
            <div style={{ color: '#c77070', fontSize: 13, padding: 20 }}>{error}</div>
          ) : attachments.length === 0 ? (
            <div style={{ color: '#555', fontSize: 13, padding: 20, textAlign: 'center' }}>
              <div style={{ marginBottom: 8 }}>No attachment on this bill in Xero.</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                Attach the original supplier invoice in Xero to see it here.
              </div>
            </div>
          ) : !blobUrl ? (
            <div style={{ color: '#555', fontSize: 13 }}>Loading {active?.fileName}…</div>
          ) : isPdf ? (
            <iframe
              src={blobUrl}
              title={active?.fileName ?? 'attachment'}
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
            />
          ) : isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={blobUrl}
              alt={active?.fileName ?? 'attachment'}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          ) : (
            <div style={{ color: '#888', fontSize: 13, padding: 20, textAlign: 'center' }}>
              <div style={{ marginBottom: 12 }}>
                Can&apos;t preview this file type ({mime ?? 'unknown'}).
              </div>
              <a
                href={blobUrl}
                download={active?.fileName}
                style={{ color: '#5ab0ff', fontSize: 13, textDecoration: 'underline' }}
              >
                Download {active?.fileName}
              </a>
            </div>
          )}
        </div>

        {/* Footer with download link */}
        {blobUrl && active && (
          <div style={{
            padding: '10px 22px',
            borderTop: '1px solid #1e1e1e',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 11,
            color: '#666',
            flexShrink: 0,
          }}>
            <span>
              {active.fileName} · {(active.contentLength / 1024).toFixed(0)} KB
            </span>
            <a
              href={blobUrl}
              download={active.fileName}
              style={{ color: '#5ab0ff', textDecoration: 'none' }}
            >
              Download ↓
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #333',
  background: '#111',
  color: '#e0e0e0',
  fontSize: 13,
  outline: 'none',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666' }}>{label}</span>
      {children}
    </label>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: '10px 14px',
      fontWeight: 600,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      textAlign: right ? 'right' : 'left',
    }}>{children}</th>
  )
}

function Td({ children, right, mono }: { children?: React.ReactNode; right?: boolean; mono?: boolean }) {
  return (
    <td style={{
      padding: '10px 14px',
      color: '#ccc',
      textAlign: right ? 'right' : 'left',
      fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
      fontSize: mono ? 12 : 13,
    }}>{children}</td>
  )
}
