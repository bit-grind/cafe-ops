'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import BpHeader from '@/components/BpHeader'
import Chip from '@/components/Chip'
import { supabase } from '@/lib/supabaseClient'
import { money as fmtMoney, fmtDate as fmtDateIso } from '@/app/lib/fmt'

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

// When a product description already carries its own weight (e.g. "Boulot 1kg
// SLICED", "Baguette 500g"), the extractor sometimes reports the quantity in
// kg — but that's really a *count* of pre-weighed units. Convert those back to
// a unit count so "3 kg" of a 1kg loaf reads as "3 loaves".
const BREAD_HINT = /(bread|loaf|loaves|boulot|baguette|sourdough|ciabatta|focaccia|roll|bun)/i
function fmtQty(quantity: number | null, unit: string | null, description: string): string {
  if (quantity == null) return '—'
  const weightMatch = description.match(/(\d+(?:\.\d+)?)\s?(kg|g)\b/i)
  const unitIsKg = unit?.toLowerCase() === 'kg'
  if (weightMatch && unitIsKg) {
    const weight = parseFloat(weightMatch[1])
    const inKg = weightMatch[2].toLowerCase() === 'g' ? weight / 1000 : weight
    if (inKg > 0) {
      const count = Math.round((quantity / inKg) * 10) / 10
      const isBread = BREAD_HINT.test(description)
      const label = isBread ? (count === 1 ? 'loaf' : 'loaves') : (count === 1 ? 'unit' : 'units')
      return `${count} ${label}`
    }
  }
  return `${quantity}${unit ? ` ${unit}` : ''}`
}

function matchSupplierLabel(contactName: string): string | null {
  const norm = normalise(contactName)
  for (const s of SUPPLIERS) {
    if (s.keywords.some(k => norm.includes(normalise(k)))) return s.label
  }
  return null
}

const money = (n: number, ccy = 'AUD') => fmtMoney(n, ccy, 2)
const fmtDate = (s: string | null) => fmtDateIso(s)

export default function BillsPage() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [allowedTabs, setAllowedTabs] = useState<string[]>([])

  const [connected, setConnected] = useState<boolean | null>(null)
  const [bills, setBills] = useState<Bill[]>([])
  const [totalScanned, setTotalScanned] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  // Filters
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [activeSupplier, setActiveSupplier] = useState<string>('All')
  const [dateOpen, setDateOpen] = useState(false)
  const dateRef = useRef<HTMLDivElement>(null)

  // Pagination
  const PAGE_SIZE = 20
  const [currentPage, setCurrentPage] = useState(1)

  // Line item search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{
    id: number
    description: string
    quantity: number | null
    unit: string | null
    unit_price: number | null
    total: number | null
    category: string | null
    supplier: string | null
    invoiceNumber: string | null
    invoiceDate: string | null
    invoiceId: string
  }>>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchActive, setSearchActive] = useState(false)

  // Detail modal
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attachmentBlobs, setAttachmentBlobs] = useState<Array<{ url: string; mime: string } | null>>([])
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
          setAllowedTabs(me.allowedTabs ?? [])
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
    setAttachmentBlobs([])
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
    attachmentBlobs.forEach(b => b && URL.revokeObjectURL(b.url))
    setSelectedBill(null)
    setAttachments([])
    setAttachmentBlobs([])
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

  // Fetch every attachment's bytes as a blob URL in parallel so the viewer
  // can render each one stacked (like pages of a single invoice).
  useEffect(() => {
    if (!selectedBill || attachments.length === 0) return
    let cancelled = false
    const created: string[] = []
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const results = await Promise.all(
          attachments.map(async (att) => {
            const url = `/api/xero/bills/${encodeURIComponent(selectedBill.invoiceID)}/attachments/${encodeURIComponent(att.fileName)}`
            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
            })
            if (!res.ok) return null
            const blob = await res.blob()
            const mime = res.headers.get('content-type') ?? blob.type ?? att.mimeType
            const blobUrl = URL.createObjectURL(blob)
            created.push(blobUrl)
            return { url: blobUrl, mime }
          })
        )
        if (cancelled) {
          created.forEach(URL.revokeObjectURL)
          return
        }
        setAttachmentBlobs(results)
      } catch (e: unknown) {
        if (!cancelled) setDetailError(e instanceof Error ? e.message : 'Attachment load failed')
      }
    })()
    return () => {
      cancelled = true
      created.forEach(URL.revokeObjectURL)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBill, attachments])

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

  async function runSearch(q?: string) {
    const query = (q ?? searchQuery).trim()
    if (!query) { setSearchActive(false); setSearchResults([]); return }
    setSearchBusy(true)
    setSearchActive(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const qs = new URLSearchParams({ q: query })
      if (dateFrom) qs.set('dateFrom', dateFrom)
      if (dateTo) qs.set('dateTo', dateTo)
      const res = await fetch(`/api/extract-lines/search?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const out = await res.json()
      if (res.ok) {
        const results = (out.results ?? []) as Array<{ invoiceDate: string | null }>
        results.sort((a, b) => (b.invoiceDate ?? '').localeCompare(a.invoiceDate ?? ''))
        setSearchResults(results as typeof searchResults)
      } else {
        setError(out.error ?? 'Search failed')
      }
    } catch { setError('Search failed') }
    finally { setSearchBusy(false) }
  }

  function clearSearch() {
    setSearchQuery('')
    setSearchActive(false)
    setSearchResults([])
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

  const allVisibleBills = useMemo(() => {
    if (activeSupplier === 'All') {
      // Flatten all matched bills, sorted by date desc
      const all: Bill[] = []
      for (const [, list] of bySupplier) all.push(...list)
      return all.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    }
    return bySupplier.get(activeSupplier) ?? []
  }, [bySupplier, activeSupplier])

  const totalPages = Math.max(1, Math.ceil(allVisibleBills.length / PAGE_SIZE))

  // Reset to page 1 when the filtered set changes
  useEffect(() => {
    setCurrentPage(1)
  }, [activeSupplier, dateFrom, dateTo])

  const visibleBills = useMemo(() => {
    const startIdx = (currentPage - 1) * PAGE_SIZE
    return allVisibleBills.slice(startIdx, startIdx + PAGE_SIZE)
  }, [allVisibleBills, currentPage])

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} activeTab="bills" allowedTabs={allowedTabs} />

      <div className="bp-container" style={{ paddingTop: 24 }}>
        {loading ? (
          <div style={{ opacity: 0.6 }}>Loading…</div>
        ) : connected === false ? (
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
              <div style={{ fontWeight: 700, fontSize: 22 }}>
                {activeSupplier === 'All' ? 'All suppliers' : activeSupplier}
              </div>

              <div ref={dateRef} style={{ position: 'relative' }}>
                <Chip active={!!(dateFrom || dateTo)} onClick={() => setDateOpen(o => !o)}>
                  {dateFrom || dateTo
                    ? `${dateFrom ? fmtDate(dateFrom) : '…'} – ${dateTo ? fmtDate(dateTo) : '…'}`
                    : 'Date range'}
                  <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
                </Chip>

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
                        onClick={() => {
                          loadBills()
                          if (searchActive) runSearch()
                          setDateOpen(false)
                        }}
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
                            setTimeout(() => {
                              loadBills()
                              if (searchActive) runSearch()
                              setDateOpen(false)
                            }, 0)
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

            {/* Search bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                className="bp-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch() }}
                placeholder="Search invoice line items (e.g. milk, salmon, cheddar)…"
                aria-label="Search line items"
              />
              <button
                onClick={() => runSearch()}
                disabled={searchBusy || !searchQuery.trim()}
                className="bp-btn bp-btn--primary"
                style={{ whiteSpace: 'nowrap' }}
              >
                {searchBusy ? '…' : 'Search'}
              </button>
              {searchActive && (
                <button onClick={clearSearch} className="bp-btn" style={{ whiteSpace: 'nowrap' }}>
                  Clear
                </button>
              )}
            </div>

            {/* Supplier tabs */}
            {!searchActive && (
              <div
                role="tablist"
                aria-label="Filter by supplier"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 14,
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {(() => {
                  const allCount = Array.from(bySupplier.values()).reduce((n, list) => n + list.length, 0)
                  return (
                    <Chip
                      active={activeSupplier === 'All'}
                      onClick={() => setActiveSupplier('All')}
                      count={allCount}
                    >
                      All
                    </Chip>
                  )
                })()}
                {SUPPLIERS.map(s => {
                  const count = bySupplier.get(s.label)?.length ?? 0
                  return (
                    <Chip
                      key={s.label}
                      active={s.label === activeSupplier}
                      onClick={() => setActiveSupplier(s.label)}
                      count={count}
                    >
                      {s.label}
                    </Chip>
                  )
                })}
              </div>
            )}

            {flash && <div style={{ color: '#4cc77d', fontSize: 12, marginBottom: 10 }}>{flash}</div>}
            {error && <div style={{ color: '#c77070', fontSize: 12, marginBottom: 10 }}>{error}</div>}

            {/* Search results */}
            {searchActive && (
              <div className="bp-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--muted-strong)' }}>
                  {searchBusy ? 'Searching…' : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${searchQuery}"`}
                </div>
                {searchResults.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="bp-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th className="is-right">Qty</th>
                          <th className="is-right">Unit Price</th>
                          <th className="is-right">Total</th>
                          <th>Supplier</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchResults.map(r => {
                          const hasBill = !!bills.find(b => b.invoiceID === r.invoiceId)
                          return (
                            <tr
                              key={r.id}
                              onClick={() => {
                                const bill = bills.find(b => b.invoiceID === r.invoiceId)
                                if (bill) openBill(bill)
                              }}
                              className={hasBill ? 'is-clickable' : undefined}
                            >
                              <td>{r.description}</td>
                              <td className="is-right">{fmtQty(r.quantity, r.unit, r.description)}</td>
                              <td className="is-right">{r.unit_price != null ? money(r.unit_price) : '—'}</td>
                              <td className="is-right">{r.total != null ? money(r.total) : '—'}</td>
                              <td>{r.supplier ?? '—'}</td>
                              <td>{fmtDate(r.invoiceDate)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Bill table (normal view) */}
            {!searchActive && (
              <div className="bp-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="bp-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Supplier</th>
                        <th>Invoice #</th>
                        <th className="is-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleBills.length === 0 && !busy ? (
                        <tr>
                          <td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--muted-strong)' }}>
                            {bills.length === 0 && totalScanned > 0
                              ? `Scanned ${totalScanned} bills — none have an attached invoice file in Xero.`
                              : bills.length === 0
                              ? 'No bills match those filters.'
                              : activeSupplier === 'All'
                              ? `No supplier bills with attachments in the scanned ${totalScanned} bills.`
                              : `No ${activeSupplier} bills with attachments in the scanned ${totalScanned} bills.`}
                          </td>
                        </tr>
                      ) : (
                        visibleBills.map(b => (
                          <tr
                            key={b.invoiceID}
                            onClick={() => openBill(b)}
                            className="is-clickable"
                          >
                            <td>{fmtDate(b.date)}</td>
                            <td>{b.contactName}</td>
                            <td className="is-mono">{b.invoiceNumber ?? '—'}</td>
                            <td className="is-right">{money(b.total, b.currencyCode)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pagination controls */}
            {!searchActive && allVisibleBills.length > PAGE_SIZE && (
              <nav
                aria-label="Pagination"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 12,
                  fontSize: 12,
                  color: 'var(--muted-strong)',
                }}
              >
                <div>
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, allVisibleBills.length)} of {allVisibleBills.length}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <Chip
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    ‹ Prev
                  </Chip>
                  {(() => {
                    const pages: (number | '…')[] = []
                    const add = (n: number) => { if (!pages.includes(n) && n >= 1 && n <= totalPages) pages.push(n) }
                    add(1)
                    if (currentPage - 1 > 2) pages.push('…')
                    for (let n = currentPage - 1; n <= currentPage + 1; n++) add(n)
                    if (currentPage + 1 < totalPages - 1) pages.push('…')
                    add(totalPages)
                    return pages.map((p, i) =>
                      p === '…' ? (
                        <span key={`e${i}`} style={{ padding: '4px 6px', color: 'var(--muted-strong)' }}>…</span>
                      ) : (
                        <Chip
                          key={p}
                          active={p === currentPage}
                          onClick={() => setCurrentPage(p)}
                        >
                          {p}
                        </Chip>
                      )
                    )
                  })()}
                  <Chip
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next ›
                  </Chip>
                </div>
              </nav>
            )}

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
          blobs={attachmentBlobs}
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
  blobs,
  loading,
  error,
  onClose,
}: {
  bill: Bill
  attachments: Attachment[]
  blobs: Array<{ url: string; mime: string } | null>
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  const totalKb = attachments.reduce((s, a) => s + a.contentLength, 0) / 1024

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
          border: '1px solid var(--border)',
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
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--muted-strong)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Supplier bill
              {attachments.length > 1 && ` · ${attachments.length} pages`}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{bill.contactName}</div>
            <div style={{ fontSize: 12, color: 'var(--muted-strong)', marginTop: 4 }}>
              {bill.invoiceNumber ? `#${bill.invoiceNumber} · ` : ''}
              {fmtDate(bill.date)}
              {' · '}{money(bill.total, bill.currencyCode)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="bp-btn"
            style={{ width: 36, height: 36, padding: 0, fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Stacked viewer */}
        <div style={{
          flex: 1,
          minHeight: 0,
          background: '#000',
          overflowY: 'auto',
          position: 'relative',
        }}>
          {loading ? (
            <div style={{ color: 'var(--muted-strong)', fontSize: 13, padding: 40, textAlign: 'center' }}>
              Loading attachments…
            </div>
          ) : error ? (
            <div style={{ color: '#c77070', fontSize: 13, padding: 20 }}>{error}</div>
          ) : attachments.length === 0 ? (
            <div style={{ color: 'var(--muted-strong)', fontSize: 13, padding: 40, textAlign: 'center' }}>
              <div style={{ marginBottom: 8 }}>No attachment on this bill in Xero.</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                Attach the original supplier invoice in Xero to see it here.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {attachments.map((att, i) => {
                const blob = blobs[i] ?? null
                const isPdf = blob?.mime === 'application/pdf' || att.fileName.toLowerCase().endsWith('.pdf')
                const isImage = blob?.mime?.startsWith('image/')
                return (
                  <div
                    key={att.attachmentID}
                    style={{
                      borderBottom: i < attachments.length - 1 ? '1px solid var(--border)' : undefined,
                    }}
                  >
                    {attachments.length > 1 && (
                      <div style={{
                        padding: '8px 22px',
                        fontSize: 11,
                        color: 'var(--muted-strong)',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        background: 'rgba(255,255,255,0.02)',
                      }}>
                        Page {i + 1} of {attachments.length} · {att.fileName}
                      </div>
                    )}
                    {!blob ? (
                      <div style={{ color: 'var(--muted-strong)', fontSize: 13, padding: 40, textAlign: 'center' }}>
                        Loading {att.fileName}…
                      </div>
                    ) : isPdf ? (
                      <iframe
                        src={blob.url}
                        title={att.fileName}
                        style={{ width: '100%', height: '85vh', border: 'none', background: '#fff', display: 'block' }}
                      />
                    ) : isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={blob.url}
                        alt={att.fileName}
                        style={{ width: '100%', display: 'block' }}
                      />
                    ) : (
                      <div style={{ color: '#888', fontSize: 13, padding: 20, textAlign: 'center' }}>
                        <div style={{ marginBottom: 12 }}>
                          Can&apos;t preview {att.fileName} ({blob.mime || 'unknown'}).
                        </div>
                        <a
                          href={blob.url}
                          download={att.fileName}
                          style={{ color: '#5ab0ff', fontSize: 13, textDecoration: 'underline' }}
                        >
                          Download {att.fileName}
                        </a>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {attachments.length > 0 && (
          <div style={{
            padding: '10px 22px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 11,
            color: 'var(--muted-strong)',
            flexShrink: 0,
          }}>
            <span>
              {attachments.length} file{attachments.length === 1 ? '' : 's'} · {totalKb.toFixed(0)} KB total
            </span>
            <div style={{ display: 'flex', gap: 12 }}>
              {attachments.map((att, i) => blobs[i] && (
                <a
                  key={att.attachmentID}
                  href={blobs[i]!.url}
                  download={att.fileName}
                  style={{ color: '#5ab0ff', textDecoration: 'none' }}
                >
                  ↓ {att.fileName}
                </a>
              ))}
            </div>
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

