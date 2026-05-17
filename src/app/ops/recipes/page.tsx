'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import BpHeader from '@/components/BpHeader'
import { supabase } from '@/lib/supabaseClient'
import type { AppTab } from '@/lib/permissions'

type RecipeSummary = {
  id: number
  name: string
  yield_qty: number
  yield_unit: string
}

type Ingredient = {
  id: number
  ingredient: string
  qty_value: number | null
  qty_unit: string | null
  notes: string | null
  unit_cost: number | null
  sort_order: number
}

type SuggestionMatch = {
  id: number
  description: string
  unit_price: number
  unit: string | null
  supplier: string | null
  invoice_date: string | null
}

type CostMap = Record<number, string>
type SuggestionsMap = Record<number, SuggestionMatch[]>

function fmtDate(d: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function fmt(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function SuggestionDropdown({
  matches,
  onPick,
}: {
  matches: SuggestionMatch[]
  onPick: (price: number) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  if (!matches.length) return null

  const top = matches[0]
  const rest = matches.slice(1)

  return (
    <div ref={ref} style={{ position: 'relative', marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Primary suggestion chip */}
        <button
          onClick={() => onPick(top.unit_price)}
          title={`Use ${fmt(top.unit_price)}${top.unit ? ` / ${top.unit}` : ''} from ${top.supplier ?? 'invoice'}`}
          style={{
            flex: 1,
            background: 'rgba(125,211,168,0.08)',
            border: '1px solid rgba(125,211,168,0.25)',
            borderRadius: 5,
            color: '#7dd3a8',
            fontSize: 11,
            padding: '3px 6px',
            cursor: 'pointer',
            font: 'inherit',
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          ↑ {fmt(top.unit_price)}{top.unit ? `/${top.unit}` : ''}
        </button>

        {/* Dropdown toggle (only if alternatives exist) */}
        {rest.length > 0 && (
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              color: 'var(--muted-strong)',
              fontSize: 10,
              padding: '3px 5px',
              cursor: 'pointer',
              font: 'inherit',
              flexShrink: 0,
            }}
            aria-label="More suggestions"
          >
            ▾
          </button>
        )}
      </div>

      {/* Supplier label under chip */}
      <div style={{ fontSize: 10, color: 'var(--muted-strong)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {top.supplier ? top.supplier.split(' ').slice(0, 3).join(' ') : ''}
        {top.invoice_date ? ` · ${fmtDate(top.invoice_date)}` : ''}
      </div>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 4,
            zIndex: 50,
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 8,
            minWidth: 260,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          {/* Top match */}
          <SuggestionRow match={top} onPick={price => { onPick(price); setOpen(false) }} active />
          {/* Alternatives */}
          {rest.map(m => (
            <SuggestionRow key={m.id} match={m} onPick={price => { onPick(price); setOpen(false) }} />
          ))}
        </div>
      )}
    </div>
  )
}

function SuggestionRow({
  match,
  onPick,
  active = false,
}: {
  match: SuggestionMatch
  onPick: (price: number) => void
  active?: boolean
}) {
  return (
    <button
      onClick={() => onPick(match.unit_price)}
      style={{
        width: '100%',
        background: active ? 'rgba(125,211,168,0.07)' : 'transparent',
        border: 'none',
        borderTop: active ? 'none' : '1px solid var(--border)',
        color: 'inherit',
        cursor: 'pointer',
        font: 'inherit',
        padding: '8px 12px',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>
            {match.description}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted-strong)', marginTop: 2 }}>
            {match.supplier ?? ''}
            {match.invoice_date ? ` · ${fmtDate(match.invoice_date)}` : ''}
          </div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#7dd3a8', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {fmt(match.unit_price)}
          {match.unit ? <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted-strong)' }}>/{match.unit}</span> : ''}
        </div>
      </div>
    </button>
  )
}

export default function RecipesPage() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [allowedTabs, setAllowedTabs] = useState<AppTab[]>([])
  const [token, setToken] = useState<string | null>(null)

  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSummary | null>(null)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<SuggestionsMap>({})
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [costs, setCosts] = useState<CostMap>({})
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) { window.location.href = '/login'; return }
      const accessToken = sessionData.session.access_token
      setEmail(sessionData.session.user.email ?? null)
      setToken(accessToken)

      const [meRes, recipesRes] = await Promise.all([
        fetch('/api/me', { headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => null),
        fetch('/api/recipes', { headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => null),
      ])

      if (meRes?.ok) {
        const me = await meRes.json()
        if (me.isGuest) { window.location.replace('/ops'); return }
        setAllowedTabs(me.allowedTabs ?? [])
      }
      if (recipesRes?.ok) {
        const body = await recipesRes.json()
        setRecipes(body.recipes ?? [])
      }
      setLoading(false)
    }
    init()
  }, [])

  const loadRecipe = useCallback(async (id: number, tok: string) => {
    setDetailLoading(true)
    setIngredients([])
    setCosts({})
    setSuggestions({})
    setSavedMsg(null)

    const res = await fetch(`/api/recipes/${id}`, { headers: { Authorization: `Bearer ${tok}` } })
    if (res.ok) {
      const body = await res.json()
      setSelectedRecipe(body.recipe)
      const ings: Ingredient[] = body.ingredients ?? []
      setIngredients(ings)
      const initial: CostMap = {}
      for (const ing of ings) {
        initial[ing.id] = ing.unit_cost != null ? String(ing.unit_cost) : ''
      }
      setCosts(initial)
    }
    setDetailLoading(false)

    // Load suggestions in background
    setSuggestionsLoading(true)
    const sugRes = await fetch(`/api/recipes/${id}/suggestions`, { headers: { Authorization: `Bearer ${tok}` } }).catch(() => null)
    if (sugRes?.ok) {
      const sugBody = await sugRes.json()
      setSuggestions(sugBody.suggestions ?? {})
    }
    setSuggestionsLoading(false)
  }, [])

  useEffect(() => {
    if (selectedId !== null && token) loadRecipe(selectedId, token)
  }, [selectedId, token, loadRecipe])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function saveCosts() {
    if (!selectedId || !token) return
    setSaving(true)
    setSavedMsg(null)
    const payload = ingredients.map(ing => ({
      id: ing.id,
      unit_cost: costs[ing.id] !== '' && costs[ing.id] != null
        ? parseFloat(costs[ing.id]) || null
        : null,
    }))
    const res = await fetch(`/api/recipes/${selectedId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ costs: payload }),
    })
    setSaving(false)
    setSavedMsg(res.ok ? 'Saved' : 'Error saving')
    if (res.ok) setTimeout(() => setSavedMsg(null), 2500)
  }

  function applySuggestion(ingId: number, price: number) {
    setSavedMsg(null)
    setCosts(prev => ({ ...prev, [ingId]: String(price) }))
  }

  // Computed costs
  const lineCosts = ingredients.map(ing => {
    const costVal = parseFloat(costs[ing.id] ?? '') || null
    if (costVal == null) return null
    if (ing.qty_value != null) return ing.qty_value * costVal
    return costVal
  })
  const totalBatch = lineCosts.reduce<number>((s, c) => s + (c ?? 0), 0)
  const costPerUnit = selectedRecipe && selectedRecipe.yield_qty > 0
    ? totalBatch / selectedRecipe.yield_qty
    : 0
  const hasCosts = lineCosts.some(c => c != null)

  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} activeTab="recipes" allowedTabs={allowedTabs} />

      <div className="bp-container" style={{ paddingTop: 28 }}>
        <div style={{
          fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--muted-strong)', marginBottom: 18,
        }}>
          Recipe costing
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 18, alignItems: 'start' }}>

          {/* Left: recipe list */}
          <div className="bp-card" style={{ padding: 0, position: 'sticky', top: 20 }}>
            <div style={{ padding: '12px 12px 8px' }}>
              <input
                className="bp-input"
                placeholder="Search recipes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ fontSize: 13, padding: '8px 10px' }}
              />
            </div>
            {loading ? (
              <div style={{ padding: '12px 14px' }}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bp-skel" style={{ height: 36, marginBottom: 6, borderRadius: 8 }} />
                ))}
              </div>
            ) : (
              <div style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                {filtered.map(r => {
                  const active = r.id === selectedId
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '10px 14px',
                        background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                        border: 'none', borderTop: '1px solid var(--border)',
                        color: active ? '#fff' : 'var(--muted-strong)',
                        cursor: 'pointer', font: 'inherit', fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        transition: 'background 0.12s, color 0.12s',
                      }}
                    >
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted-strong)', marginTop: 2 }}>
                        {r.yield_qty} × {r.yield_unit}
                      </div>
                    </button>
                  )
                })}
                {filtered.length === 0 && (
                  <div style={{ padding: '16px 14px', fontSize: 13, color: 'var(--muted-strong)' }}>
                    No recipes found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: recipe detail */}
          {!selectedId ? (
            <div className="bp-card" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 320, color: 'var(--muted-strong)', fontSize: 13,
            }}>
              Select a recipe to view and cost it
            </div>
          ) : detailLoading ? (
            <div className="bp-card">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bp-skel" style={{ height: 40, marginBottom: 10, borderRadius: 8 }} />
              ))}
            </div>
          ) : selectedRecipe ? (
            <div>
              {/* Recipe header */}
              <div className="bp-card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
                      {selectedRecipe.name}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted-strong)', marginTop: 4 }}>
                      Yields {selectedRecipe.yield_qty} {selectedRecipe.yield_unit}{selectedRecipe.yield_qty !== 1 ? 's' : ''}
                      {suggestionsLoading && (
                        <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--muted-strong)' }}>
                          · finding invoice prices…
                        </span>
                      )}
                    </div>
                  </div>

                  {hasCosts && (
                    <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-strong)' }}>
                          Batch cost
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{fmt(totalBatch)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-strong)' }}>
                          Per {selectedRecipe.yield_unit}
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, color: '#7dd3a8' }}>
                          {fmt(costPerUnit)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Ingredients table */}
              <div className="bp-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="bp-table" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '30%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '14%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Ingredient</th>
                      <th className="is-right">Qty</th>
                      <th>Unit</th>
                      <th style={{ color: 'var(--muted-strong)' }}>Notes</th>
                      <th className="is-right">
                        $ / unit
                        {!suggestionsLoading && Object.values(suggestions).some(s => s.length > 0) && (
                          <span style={{ fontSize: 10, fontWeight: 400, color: '#7dd3a8', marginLeft: 6 }}>
                            ↑ from invoices
                          </span>
                        )}
                      </th>
                      <th className="is-right">Line $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ing, idx) => {
                      const line = lineCosts[idx]
                      const isFlat = ing.qty_value == null
                      const ingSuggestions = suggestions[ing.id] ?? []

                      return (
                        <tr key={ing.id} style={{ verticalAlign: 'top' }}>
                          <td style={{ fontWeight: 500, color: '#fff', paddingTop: 12 }}>
                            {ing.ingredient}
                          </td>
                          <td className="is-right is-mono" style={{ color: 'var(--muted-strong)', paddingTop: 12 }}>
                            {ing.qty_value != null ? ing.qty_value : '—'}
                          </td>
                          <td className="is-mono" style={{ color: 'var(--muted-strong)', fontSize: 11, paddingTop: 12 }}>
                            {ing.qty_unit ?? ''}
                          </td>
                          <td style={{ color: 'var(--muted-strong)', fontSize: 12, fontStyle: ing.notes ? 'italic' : 'normal', paddingTop: 12 }}>
                            {ing.notes ?? ''}
                          </td>
                          <td style={{ paddingTop: 10, paddingBottom: 10 }}>
                            {/* Cost input */}
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                              <span style={{ position: 'absolute', left: 6, fontSize: 11, color: 'var(--muted-strong)', pointerEvents: 'none', zIndex: 1 }}>$</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={costs[ing.id] ?? ''}
                                onChange={e => {
                                  setSavedMsg(null)
                                  setCosts(prev => ({ ...prev, [ing.id]: e.target.value }))
                                }}
                                placeholder={isFlat ? 'enter flat cost' : 'enter price'}
                                title={isFlat ? 'Enter flat batch cost for this ingredient' : `Cost per ${ing.qty_unit ?? 'unit'}`}
                                style={{
                                  width: '100%',
                                  background: 'rgba(255,255,255,0.07)',
                                  border: '1px solid rgba(255,255,255,0.2)',
                                  borderRadius: 6,
                                  color: '#fff',
                                  padding: '5px 6px 5px 18px',
                                  fontSize: 12,
                                  fontFamily: 'ui-monospace, monospace',
                                  outline: 'none',
                                  textAlign: 'right',
                                }}
                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.55)')}
                                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
                              />
                            </div>

                            {/* Suggestion chips */}
                            {ingSuggestions.length > 0 && (
                              <SuggestionDropdown
                                matches={ingSuggestions}
                                onPick={price => applySuggestion(ing.id, price)}
                              />
                            )}
                            {suggestionsLoading && ingSuggestions.length === 0 && (
                              <div className="bp-skel" style={{ height: 22, borderRadius: 5, marginTop: 4 }} />
                            )}
                          </td>
                          <td className="is-right is-mono" style={{
                            fontWeight: line != null ? 600 : 400,
                            color: line != null ? '#fff' : 'var(--muted-strong)',
                            paddingTop: 12,
                          }}>
                            {line != null ? fmt(line) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {hasCosts && (
                    <tfoot>
                      <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <td colSpan={4} style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted-strong)' }}>
                          {lineCosts.filter(c => c == null).length > 0
                            ? `${lineCosts.filter(c => c == null).length} ingredient(s) without cost — totals are partial`
                            : 'All ingredients costed'}
                        </td>
                        <td className="is-right" style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted-strong)', fontWeight: 600 }}>
                          Batch
                        </td>
                        <td className="is-right is-mono" style={{ padding: '10px 14px', fontWeight: 700, fontSize: 14 }}>
                          {fmt(totalBatch)}
                        </td>
                      </tr>
                      <tr style={{ background: 'rgba(125,211,168,0.06)' }}>
                        <td colSpan={5} style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted-strong)', fontWeight: 600 }}>
                          Cost per {selectedRecipe.yield_unit}
                          <span style={{ fontWeight: 400, marginLeft: 6 }}>
                            ({fmt(totalBatch)} ÷ {selectedRecipe.yield_qty})
                          </span>
                        </td>
                        <td className="is-right is-mono" style={{ padding: '10px 14px', fontWeight: 700, fontSize: 14, color: '#7dd3a8' }}>
                          {fmt(costPerUnit)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Save row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, justifyContent: 'flex-end' }}>
                {savedMsg && (
                  <span style={{ fontSize: 13, color: savedMsg === 'Saved' ? '#7dd3a8' : '#e58080' }}>
                    {savedMsg}
                  </span>
                )}
                <button
                  className="bp-btn bp-btn--primary"
                  onClick={saveCosts}
                  disabled={saving}
                  style={{ minWidth: 100 }}
                >
                  {saving ? 'Saving…' : 'Save costs'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
