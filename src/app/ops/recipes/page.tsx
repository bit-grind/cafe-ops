'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import BpHeader from '@/components/BpHeader'
import { supabase } from '@/lib/supabaseClient'
import type { AppTab } from '@/lib/permissions'

type RecipeSummary = { id: number; name: string; yield_qty: number; yield_unit: string }
type Ingredient = { id: number; ingredient: string; qty_value: number | null; qty_unit: string | null; notes: string | null; unit_cost: number | null; sort_order: number }
type EditIngredient = { id: number | null; ingredient: string; qty_value: string; qty_unit: string; notes: string }
type SuggestionMatch = { id: number; description: string; unit_price: number; unit: string | null; supplier: string | null; invoice_date: string | null; converted_price: number | null; converted_from: string | null; recipe_unit: string | null; approximate: boolean; can_apply: boolean }
type CostMap = Record<number, string>
type SuggestionsMap = Record<number, SuggestionMatch[]>
type ManualSearchState = Record<number, { open: boolean; q: string; loading: boolean; results: SuggestionMatch[]; error: string | null }>

function fmtDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtUnit(n: number) {
  if (n === 0) return '$0.00'
  if (Math.abs(n) < 0.01) return `$${n.toPrecision(3)}`
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

function SuggestionDropdown({ matches, onPick }: { matches: SuggestionMatch[]; onPick: (price: number) => void }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function close() { setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])
  if (!matches.length) return null
  const top = matches[0]
  const rest = matches.slice(1)
  const pickValue = (m: SuggestionMatch) => m.can_apply && m.converted_price != null ? m.converted_price : m.unit_price
  const labelOf = (m: SuggestionMatch) =>
    m.converted_price != null
      ? `${m.approximate ? '~' : ''}${fmtUnit(m.converted_price)}/${m.recipe_unit}`
      : `${fmt(m.unit_price)}${m.unit ? `/${m.unit}` : ''}`
  const topGood = top.can_apply && top.converted_price != null && !top.approximate

  function toggle() {
    if (open) { setOpen(false); return }
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = 280
    const estHeight = Math.min(matches.length, 5) * 84 + 4
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    if (window.innerHeight - rect.bottom < estHeight && rect.top > estHeight) {
      setCoords({ left, bottom: window.innerHeight - rect.top + 4 })
    } else {
      setCoords({ left, top: rect.bottom + 4 })
    }
    setOpen(true)
  }

  return (
    <div ref={ref} style={{ position: 'relative', marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => onPick(pickValue(top))}
          title={
            topGood ? `Use ${fmtUnit(top.converted_price!)}/${top.recipe_unit} (from ${top.converted_from})`
            : top.converted_price != null ? `Uses inferred price. Verify before saving.`
            : `Uses raw invoice price. Adjust manually before saving.`
          }
          style={{ flex: 1, background: topGood ? 'rgba(125,211,168,0.08)' : 'rgba(255,200,100,0.08)', border: `1px solid ${topGood ? 'rgba(125,211,168,0.25)' : 'rgba(255,200,100,0.25)'}`, borderRadius: 5, color: topGood ? '#7dd3a8' : '#f5c842', fontSize: 11, padding: '3px 6px', cursor: 'pointer', font: 'inherit', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
        >
          ↑ {labelOf(top)}{topGood ? '' : ' ⚠'}
        </button>
        {rest.length > 0 && <button onClick={toggle} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted-strong)', fontSize: 10, padding: '3px 5px', cursor: 'pointer', font: 'inherit', flexShrink: 0 }}>▾</button>}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted-strong)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {top.supplier ? top.supplier.split(' ').slice(0, 3).join(' ') : ''}{top.invoice_date ? ` · ${fmtDate(top.invoice_date)}` : ''}
      </div>
      {open && coords && (
        <div style={{ position: 'fixed', left: coords.left, top: coords.top, bottom: coords.bottom, zIndex: 1000, width: 280, maxHeight: '60vh', overflowY: 'auto', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {[top, ...rest].map((m, i) => {
            const mGood = m.can_apply && m.converted_price != null && !m.approximate
            return (
              <button key={m.id} onClick={() => { onPick(pickValue(m)); setOpen(false) }}
                style={{ width: '100%', background: i === 0 ? 'rgba(255,255,255,0.04)' : 'transparent', border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--border)', color: 'inherit', cursor: 'pointer', font: 'inherit', padding: '8px 12px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>{m.description}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-strong)', marginTop: 2 }}>{m.supplier ?? ''}{m.invoice_date ? ` · ${fmtDate(m.invoice_date)}` : ''}</div>
                    {m.converted_from && <div style={{ fontSize: 10, color: 'var(--muted-strong)', marginTop: 1 }}>Invoice: {m.converted_from}</div>}
                    {m.converted_price != null && !m.can_apply && <div style={{ fontSize: 10, color: '#f5c842', marginTop: 1 }}>Uses inferred price - verify before saving</div>}
                    {m.converted_price == null && <div style={{ fontSize: 10, color: '#f5c842', marginTop: 1 }}>Uses raw invoice price - adjust manually</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {m.converted_price != null
                      ? <div style={{ fontWeight: 700, fontSize: 13, color: mGood ? '#7dd3a8' : '#f5c842' }}>{m.approximate ? '~' : ''}{fmtUnit(m.converted_price)}<span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted-strong)' }}>/{m.recipe_unit}</span></div>
                      : <div style={{ fontWeight: 700, fontSize: 13, color: '#f5c842' }}>{fmt(m.unit_price)}{m.unit ? <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted-strong)' }}>/{m.unit}</span> : ''}</div>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ManualProductSearch({
  ing,
  token,
  state,
  onState,
  onPick,
}: {
  ing: Ingredient
  token: string | null
  state: ManualSearchState[number] | undefined
  onState: (patch: Partial<ManualSearchState[number]>) => void
  onPick: (price: number) => void
}) {
  const open = state?.open ?? false
  const q = state?.q ?? ing.ingredient
  const loading = state?.loading ?? false
  const results = state?.results ?? []
  const error = state?.error ?? null

  async function runSearch(query = q) {
    if (!token || query.trim().length < 2) return
    onState({ open: true, q: query, loading: true, error: null })
    const params = new URLSearchParams({ q: query.trim() })
    if (ing.qty_unit) params.set('recipeUnit', ing.qty_unit)
    const res = await fetch(`/api/recipes/product-search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null)
    if (!res?.ok) {
      onState({ loading: false, results: [], error: 'Search failed' })
      return
    }
    const body = await res.json()
    onState({ loading: false, results: body.results ?? [], error: null })
  }

  return (
    <div style={{ position: 'relative', marginTop: 6 }}>
      {!open ? (
        <button className="bp-btn" onClick={() => { onState({ open: true, q: ing.ingredient, results: [], error: null }); void runSearch(ing.ingredient) }}
          style={{ width: '100%', fontSize: 11, padding: '4px 7px', justifyContent: 'center', color: 'var(--muted-strong)' }}>
          Search invoices
        </button>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 4 }}>
            <input className="bp-input" value={q} placeholder="Search invoice products"
              onChange={e => onState({ q: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') void runSearch() }}
              style={{ fontSize: 11, padding: '5px 7px' }} />
            <button className="bp-btn" onClick={() => void runSearch()} disabled={loading || q.trim().length < 2} style={{ fontSize: 11, padding: '5px 7px' }}>
              {loading ? '...' : 'Go'}
            </button>
            <button className="bp-btn" onClick={() => onState({ open: false })} style={{ fontSize: 11, padding: '5px 7px' }}>x</button>
          </div>
          <div style={{ position: 'absolute', right: 0, top: 34, zIndex: 20, width: 360, maxHeight: 280, overflowY: 'auto', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
            {loading && <div className="bp-skel" style={{ height: 34, margin: 8, borderRadius: 6 }} />}
            {!loading && error && <div style={{ padding: 10, fontSize: 12, color: '#e58080' }}>{error}</div>}
            {!loading && !error && results.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--muted-strong)' }}>No invoice products found</div>}
            {!loading && !error && results.map((m, i) => {
              const canApplyConverted = m.can_apply && m.converted_price != null
              const pickPrice = m.converted_price ?? m.unit_price
              return (
                <button key={`${m.id}-${i}`}
                  onClick={() => { onPick(pickPrice); onState({ open: false }) }}
                  style={{ width: '100%', background: i === 0 ? 'rgba(255,255,255,0.04)' : 'transparent', border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--border)', color: 'inherit', cursor: 'pointer', font: 'inherit', padding: '8px 10px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.description}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted-strong)', marginTop: 2 }}>{m.supplier ?? ''}{m.invoice_date ? ` · ${fmtDate(m.invoice_date)}` : ''}</div>
                      {m.converted_from && <div style={{ fontSize: 10, color: 'var(--muted-strong)', marginTop: 1 }}>Invoice: {m.converted_from}</div>}
                      {!canApplyConverted && <div style={{ fontSize: 10, color: '#f5c842', marginTop: 1 }}>Uses raw invoice price - adjust manually</div>}
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right', fontSize: 12, fontWeight: 700, color: canApplyConverted ? '#7dd3a8' : '#f5c842' }}>
                      {m.converted_price != null ? `${fmtUnit(m.converted_price)}/${m.recipe_unit}` : `${fmt(m.unit_price)}${m.unit ? `/${m.unit}` : ''}`}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const EMPTY_ING: EditIngredient = { id: null, ingredient: '', qty_value: '', qty_unit: '', notes: '' }

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
  const [manualSearch, setManualSearch] = useState<ManualSearchState>({})
  const [costs, setCosts] = useState<CostMap>({})
  const [costSaving, setCostSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  // Edit / create state
  const [editMode, setEditMode] = useState(false)
  const [isNewRecipe, setIsNewRecipe] = useState(false)
  const [editName, setEditName] = useState('')
  const [editYieldQty, setEditYieldQty] = useState('')
  const [editYieldUnit, setEditYieldUnit] = useState('')
  const [editIngredients, setEditIngredients] = useState<EditIngredient[]>([EMPTY_ING])
  const [recipeSaving, setRecipeSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [recipeError, setRecipeError] = useState<string | null>(null)

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
      if (recipesRes?.ok) { const body = await recipesRes.json(); setRecipes(body.recipes ?? []) }
      setLoading(false)
    }
    init()
  }, [])

  const loadRecipe = useCallback(async (id: number, tok: string) => {
    setDetailLoading(true)
    setIngredients([]); setCosts({}); setSuggestions({}); setManualSearch({}); setSavedMsg(null)
    const res = await fetch(`/api/recipes/${id}`, { headers: { Authorization: `Bearer ${tok}` } })
    if (res.ok) {
      const body = await res.json()
      setSelectedRecipe(body.recipe)
      const ings: Ingredient[] = body.ingredients ?? []
      setIngredients(ings)
      const initial: CostMap = {}
      for (const ing of ings) initial[ing.id] = ing.unit_cost != null ? String(ing.unit_cost) : ''
      setCosts(initial)
    }
    setDetailLoading(false)
    setSuggestionsLoading(true)
    const sugRes = await fetch(`/api/recipes/${id}/suggestions`, { headers: { Authorization: `Bearer ${tok}` } }).catch(() => null)
    if (sugRes?.ok) { const b = await sugRes.json(); setSuggestions(b.suggestions ?? {}) }
    setSuggestionsLoading(false)
  }, [])

  useEffect(() => {
    if (selectedId === null || !token || editMode) return
    void Promise.resolve().then(() => loadRecipe(selectedId, token))
  }, [selectedId, token, loadRecipe, editMode])

  async function signOut() { await supabase.auth.signOut(); window.location.href = '/login' }

  // ── Edit / create handlers ─────────────────────────────────────────────

  function startEdit() {
    if (!selectedRecipe) return
    setEditName(selectedRecipe.name)
    setEditYieldQty(String(selectedRecipe.yield_qty))
    setEditYieldUnit(selectedRecipe.yield_unit)
    setEditIngredients(ingredients.map(ing => ({ id: ing.id, ingredient: ing.ingredient, qty_value: ing.qty_value != null ? String(ing.qty_value) : '', qty_unit: ing.qty_unit ?? '', notes: ing.notes ?? '' })))
    setDeleteConfirm(false); setRecipeError(null); setEditMode(true); setIsNewRecipe(false)
  }

  function startNewRecipe() {
    setSelectedId(null); setSelectedRecipe(null); setIngredients([]); setCosts({}); setSuggestions({}); setManualSearch({})
    setEditName(''); setEditYieldQty('1'); setEditYieldUnit('portion')
    setEditIngredients([{ ...EMPTY_ING }])
    setDeleteConfirm(false); setRecipeError(null); setIsNewRecipe(true); setEditMode(true)
  }

  function cancelEdit() {
    setEditMode(false); setIsNewRecipe(false); setDeleteConfirm(false); setRecipeError(null)
  }

  function updateIng(idx: number, field: keyof EditIngredient, value: string) {
    setEditIngredients(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  function addIngRow() {
    setEditIngredients(prev => [...prev, { ...EMPTY_ING }])
  }

  function removeIngRow(idx: number) {
    setEditIngredients(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveRecipe() {
    if (!token || !editName.trim()) return
    setRecipeSaving(true); setRecipeError(null)

    const ingsPayload = editIngredients
      .filter(r => r.ingredient.trim())
      .map((r, i) => ({
        id: r.id,
        ingredient: r.ingredient.trim(),
        qty_value: r.qty_value ? parseFloat(r.qty_value) || null : null,
        qty_unit: r.qty_unit.trim() || null,
        notes: r.notes.trim() || null,
        // Preserve saved cost for existing ingredients
        unit_cost: r.id != null && costs[r.id] ? parseFloat(costs[r.id]) || null : null,
        sort_order: i,
      }))

    const payload = { name: editName.trim(), yield_qty: parseFloat(editYieldQty) || 1, yield_unit: editYieldUnit.trim() || 'portion', ingredients: ingsPayload }

    if (isNewRecipe) {
      const res = await fetch('/api/recipes', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (res.ok) {
        const body = await res.json()
        const r = body.recipe as RecipeSummary
        setRecipes(prev => [...prev, r].sort((a, b) => a.name.localeCompare(b.name)))
        setEditMode(false); setIsNewRecipe(false)
        setSelectedId(r.id) // triggers loadRecipe via effect
      } else {
        const e = await res.json(); setRecipeError(e.error ?? 'Failed to create')
      }
    } else {
      const res = await fetch(`/api/recipes/${selectedId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (res.ok) {
        setRecipes(prev => prev.map(r => r.id === selectedId ? { ...r, name: payload.name, yield_qty: payload.yield_qty, yield_unit: payload.yield_unit } : r).sort((a, b) => a.name.localeCompare(b.name)))
        setEditMode(false)
        if (selectedId && token) loadRecipe(selectedId, token)
      } else {
        const e = await res.json(); setRecipeError(e.error ?? 'Failed to save')
      }
    }
    setRecipeSaving(false)
  }

  async function deleteRecipe() {
    if (!selectedId || !token) return
    const res = await fetch(`/api/recipes/${selectedId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      setRecipes(prev => prev.filter(r => r.id !== selectedId))
      setSelectedId(null); setSelectedRecipe(null); setIngredients([]); setCosts({}); setSuggestions({}); setManualSearch({})
      setEditMode(false); setIsNewRecipe(false); setDeleteConfirm(false)
    }
  }

  // ── Cost handlers ──────────────────────────────────────────────────────

  async function saveCosts() {
    if (!selectedId || !token) return
    setCostSaving(true); setSavedMsg(null)
    const payload = ingredients.map(ing => ({ id: ing.id, unit_cost: costs[ing.id] !== '' && costs[ing.id] != null ? parseFloat(costs[ing.id]) || null : null }))
    const res = await fetch(`/api/recipes/${selectedId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ costs: payload }) })
    setCostSaving(false)
    setSavedMsg(res.ok ? 'Saved' : 'Error saving')
    if (res.ok) setTimeout(() => setSavedMsg(null), 2500)
  }

  function applySuggestion(ingId: number, price: number) {
    setSavedMsg(null); setCosts(prev => ({ ...prev, [ingId]: String(price) }))
  }

  function updateManualSearch(ingId: number, patch: Partial<ManualSearchState[number]>) {
    const emptyState = { open: false, q: '', loading: false, results: [], error: null }
    setManualSearch(prev => ({
      ...prev,
      [ingId]: { ...emptyState, ...prev[ingId], ...patch },
    }))
  }

  // ── Computed ───────────────────────────────────────────────────────────

  const lineCosts = ingredients.map(ing => {
    const v = parseFloat(costs[ing.id] ?? '') || null
    if (v == null) return null
    return ing.qty_value != null ? ing.qty_value * v : v
  })
  const totalBatch = lineCosts.reduce<number>((s, c) => s + (c ?? 0), 0)
  const costPerUnit = selectedRecipe && selectedRecipe.yield_qty > 0 ? totalBatch / selectedRecipe.yield_qty : 0
  const hasCosts = lineCosts.some(c => c != null)
  const filtered = recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} activeTab="recipes" allowedTabs={allowedTabs} />

      <div className="bp-container" style={{ paddingTop: 28 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-strong)', marginBottom: 18 }}>Recipe costing</div>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 18, alignItems: 'start' }}>

          {/* ── Left: list ── */}
          <div className="bp-card" style={{ padding: 0, position: 'sticky', top: 20 }}>
            <div style={{ padding: '12px 12px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input className="bp-input" placeholder="Search recipes…" value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 13, padding: '8px 10px' }} />
              <button className="bp-btn bp-btn--primary" onClick={startNewRecipe} style={{ fontSize: 13, padding: '8px 10px' }}>+ New recipe</button>
            </div>
            {loading ? (
              <div style={{ padding: '12px 14px' }}>{[...Array(6)].map((_, i) => <div key={i} className="bp-skel" style={{ height: 36, marginBottom: 6, borderRadius: 8 }} />)}</div>
            ) : (
              <div style={{ maxHeight: 'calc(100vh - 230px)', overflowY: 'auto' }}>
                {filtered.map(r => {
                  const active = r.id === selectedId
                  return (
                    <button key={r.id} onClick={() => { setEditMode(false); setIsNewRecipe(false); setSelectedId(r.id) }}
                      style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: active ? 'rgba(255,255,255,0.06)' : 'transparent', border: 'none', borderTop: '1px solid var(--border)', color: active ? '#fff' : 'var(--muted-strong)', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: active ? 600 : 400 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted-strong)', marginTop: 2 }}>{r.yield_qty} × {r.yield_unit}</div>
                    </button>
                  )
                })}
                {filtered.length === 0 && <div style={{ padding: '16px 14px', fontSize: 13, color: 'var(--muted-strong)' }}>No recipes found</div>}
              </div>
            )}
          </div>

          {/* ── Right: detail / edit ── */}
          {editMode ? (
            /* ── EDIT / CREATE MODE ── */
            <div>
              <div className="bp-card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input className="bp-input" placeholder="Recipe name" value={editName} onChange={e => setEditName(e.target.value)}
                    style={{ fontSize: 18, fontWeight: 700, padding: '10px 12px' }} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--muted-strong)', flexShrink: 0 }}>Yields</span>
                    <input className="bp-input" placeholder="qty" value={editYieldQty} onChange={e => setEditYieldQty(e.target.value)}
                      inputMode="decimal" style={{ width: 72, fontSize: 13 }} />
                    <input className="bp-input" placeholder="unit" value={editYieldUnit} onChange={e => setEditYieldUnit(e.target.value)}
                      style={{ fontSize: 13 }} />
                  </div>
                  {recipeError && <div style={{ fontSize: 13, color: '#e58080' }}>{recipeError}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="bp-btn bp-btn--primary" onClick={saveRecipe} disabled={recipeSaving || !editName.trim()}>
                        {recipeSaving ? 'Saving…' : isNewRecipe ? 'Create recipe' : 'Save changes'}
                      </button>
                      <button className="bp-btn" onClick={cancelEdit} disabled={recipeSaving}>Cancel</button>
                    </div>
                    {!isNewRecipe && (
                      deleteConfirm ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 13, color: '#e58080' }}>Delete this recipe?</span>
                          <button className="bp-btn" onClick={deleteRecipe} style={{ borderColor: '#e58080', color: '#e58080' }}>Yes, delete</button>
                          <button className="bp-btn" onClick={() => setDeleteConfirm(false)}>No</button>
                        </div>
                      ) : (
                        <button className="bp-btn" onClick={() => setDeleteConfirm(true)} style={{ fontSize: 13, color: 'var(--muted-strong)' }}>Delete recipe</button>
                      )
                    )}
                  </div>
                </div>
              </div>

              <div className="bp-card" style={{ padding: 0, overflow: 'visible' }}>
                <table className="bp-table" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 36 }} />
                    <col />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '22%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Ingredient</th>
                      <th className="is-right">Qty</th>
                      <th>Unit</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editIngredients.map((ing, idx) => (
                      <tr key={idx}>
                        <td style={{ paddingRight: 4 }}>
                          <button onClick={() => removeIngRow(idx)} title="Remove"
                            style={{ background: 'none', border: 'none', color: 'var(--muted-strong)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px', display: 'flex', alignItems: 'center' }}>
                            ×
                          </button>
                        </td>
                        <td><input className="bp-input" value={ing.ingredient} onChange={e => updateIng(idx, 'ingredient', e.target.value)} placeholder="Ingredient name" style={{ fontSize: 13, padding: '6px 8px' }} /></td>
                        <td><input className="bp-input" value={ing.qty_value} onChange={e => updateIng(idx, 'qty_value', e.target.value)} placeholder="—" inputMode="decimal" style={{ fontSize: 13, padding: '6px 8px', textAlign: 'right' }} /></td>
                        <td><input className="bp-input" value={ing.qty_unit} onChange={e => updateIng(idx, 'qty_unit', e.target.value)} placeholder="g / mL…" style={{ fontSize: 12, padding: '6px 8px' }} /></td>
                        <td><input className="bp-input" value={ing.notes} onChange={e => updateIng(idx, 'notes', e.target.value)} placeholder="to taste…" style={{ fontSize: 12, padding: '6px 8px', fontStyle: 'italic' }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
                  <button className="bp-btn" onClick={addIngRow} style={{ fontSize: 13 }}>+ Add ingredient</button>
                </div>
              </div>
            </div>

          ) : !selectedId ? (
            /* ── EMPTY STATE ── */
            <div className="bp-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320, color: 'var(--muted-strong)', fontSize: 13 }}>
              Select a recipe to cost it, or create a new one
            </div>

          ) : detailLoading ? (
            <div className="bp-card">{[...Array(5)].map((_, i) => <div key={i} className="bp-skel" style={{ height: 40, marginBottom: 10, borderRadius: 8 }} />)}</div>

          ) : selectedRecipe ? (
            /* ── VIEW / COST MODE ── */
            <div>
              <div className="bp-card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>{selectedRecipe.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted-strong)', marginTop: 4 }}>
                      Yields {selectedRecipe.yield_qty} {selectedRecipe.yield_unit}{selectedRecipe.yield_qty !== 1 ? 's' : ''}
                      {suggestionsLoading && <span style={{ marginLeft: 10, fontSize: 11 }}>· finding invoice prices…</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {hasCosts && (
                      <div style={{ display: 'flex', gap: 20 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-strong)' }}>Batch cost</div>
                          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{fmt(totalBatch)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-strong)' }}>Per {selectedRecipe.yield_unit}</div>
                          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, color: '#7dd3a8' }}>{fmt(costPerUnit)}</div>
                        </div>
                      </div>
                    )}
                    <button className="bp-btn" onClick={startEdit} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Edit recipe</button>
                  </div>
                </div>
              </div>

              <div className="bp-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="bp-table" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '30%' }} /><col style={{ width: '10%' }} /><col style={{ width: '8%' }} /><col style={{ width: '16%' }} /><col style={{ width: '22%' }} /><col style={{ width: '14%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Ingredient</th><th className="is-right">Qty</th><th>Unit</th>
                      <th style={{ color: 'var(--muted-strong)' }}>Notes</th>
                      <th className="is-right">
                        $ / unit
                        {!suggestionsLoading && Object.values(suggestions).some(s => s.length > 0) && (
                          <span style={{ fontSize: 10, fontWeight: 400, color: '#7dd3a8', marginLeft: 6 }}>↑ from invoices</span>
                        )}
                      </th>
                      <th className="is-right">Line $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ing, idx) => {
                      const line = lineCosts[idx]
                      const ingSuggestions = suggestions[ing.id] ?? []
                      return (
                        <tr key={ing.id} style={{ verticalAlign: 'top' }}>
                          <td style={{ fontWeight: 500, color: '#fff', paddingTop: 12 }}>{ing.ingredient}</td>
                          <td className="is-right is-mono" style={{ color: 'var(--muted-strong)', paddingTop: 12 }}>{ing.qty_value != null ? ing.qty_value : '—'}</td>
                          <td className="is-mono" style={{ color: 'var(--muted-strong)', fontSize: 11, paddingTop: 12 }}>{ing.qty_unit ?? ''}</td>
                          <td style={{ color: 'var(--muted-strong)', fontSize: 12, fontStyle: ing.notes ? 'italic' : 'normal', paddingTop: 12 }}>{ing.notes ?? ''}</td>
                          <td style={{ paddingTop: 10, paddingBottom: 10 }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                              <span style={{ position: 'absolute', left: 6, fontSize: 11, color: 'var(--muted-strong)', pointerEvents: 'none', zIndex: 1 }}>$</span>
                              <input type="text" inputMode="decimal" value={costs[ing.id] ?? ''}
                                onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) { setSavedMsg(null); setCosts(prev => ({ ...prev, [ing.id]: v })) } }}
                                placeholder={ing.qty_value == null ? 'enter flat cost' : 'enter price'}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#fff', padding: '6px 6px 6px 18px', fontSize: 12, fontFamily: 'ui-monospace, monospace', outline: 'none', textAlign: 'right' }}
                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.55)')}
                                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')} />
                            </div>
                            {ingSuggestions.length > 0 && <SuggestionDropdown matches={ingSuggestions} onPick={price => applySuggestion(ing.id, price)} />}
                            {!suggestionsLoading && ingSuggestions.length === 0 && (
                              <ManualProductSearch
                                ing={ing}
                                token={token}
                                state={manualSearch[ing.id]}
                                onState={patch => updateManualSearch(ing.id, patch)}
                                onPick={price => applySuggestion(ing.id, price)}
                              />
                            )}
                            {suggestionsLoading && ingSuggestions.length === 0 && <div className="bp-skel" style={{ height: 22, borderRadius: 5, marginTop: 4 }} />}
                          </td>
                          <td className="is-right is-mono" style={{ fontWeight: line != null ? 600 : 400, color: line != null ? '#fff' : 'var(--muted-strong)', paddingTop: 12 }}>
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
                          {lineCosts.filter(c => c == null).length > 0 ? `${lineCosts.filter(c => c == null).length} ingredient(s) without cost — totals are partial` : 'All ingredients costed'}
                        </td>
                        <td className="is-right" style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted-strong)', fontWeight: 600 }}>Batch</td>
                        <td className="is-right is-mono" style={{ padding: '10px 14px', fontWeight: 700, fontSize: 14 }}>{fmt(totalBatch)}</td>
                      </tr>
                      <tr style={{ background: 'rgba(125,211,168,0.06)' }}>
                        <td colSpan={5} style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted-strong)', fontWeight: 600 }}>
                          Cost per {selectedRecipe.yield_unit}<span style={{ fontWeight: 400, marginLeft: 6 }}>({fmt(totalBatch)} ÷ {selectedRecipe.yield_qty})</span>
                        </td>
                        <td className="is-right is-mono" style={{ padding: '10px 14px', fontWeight: 700, fontSize: 14, color: '#7dd3a8' }}>{fmt(costPerUnit)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, justifyContent: 'flex-end' }}>
                {savedMsg && <span style={{ fontSize: 13, color: savedMsg === 'Saved' ? '#7dd3a8' : '#e58080' }}>{savedMsg}</span>}
                <button className="bp-btn bp-btn--primary" onClick={saveCosts} disabled={costSaving} style={{ minWidth: 100 }}>
                  {costSaving ? 'Saving…' : 'Save costs'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
