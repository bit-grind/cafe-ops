'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import BpHeader from '@/components/BpHeader'

type Msg = { role: 'user' | 'ai', text: string }

const QUICK_PROMPTS = [
  { label: 'Top products this week', q: 'What were our top selling products this week?' },
  { label: 'Today vs last week', q: 'How does today compare to the same day last week?' },
  { label: 'Best day last month', q: 'What was our best day last month and what drove it?' },
  { label: 'Top products last year', q: 'What were our most popular products last year?' },
  { label: '30-day trend', q: 'What is the sales trend over the last 30 days? What should we do next week?' },
  { label: 'Worst day this year', q: 'What was our worst performing day this year and why might that be?' },
  { label: 'This month vs last', q: 'How is this month tracking compared to last month?' },
]

// Queensland public holidays + key cafe dates, sorted chronologically
const HOLIDAYS = [
  { name: "Christmas Day 2025", date: "2025-12-25" },
  { name: "Boxing Day 2025", date: "2025-12-26" },
  { name: "New Year's Day", date: "2026-01-01" },
  { name: "Australia Day", date: "2026-01-26" },
  { name: "Valentine's Day", date: "2026-02-14" },
  { name: "Good Friday", date: "2026-04-03" },
  { name: "Easter Monday", date: "2026-04-06" },
  { name: "Anzac Day", date: "2026-04-25" },
  { name: "Labour Day (QLD)", date: "2026-05-04" },
  { name: "Mother's Day", date: "2026-05-10" },
  { name: "Father's Day", date: "2026-09-06" },
  { name: "King's Birthday (QLD)", date: "2026-10-26" },
  { name: "Christmas Day 2026", date: "2026-12-25" },
  { name: "Boxing Day 2026", date: "2026-12-26" },
  { name: "New Year's Day 2027", date: "2027-01-01" },
  { name: "Australia Day 2027", date: "2027-01-26" },
  { name: "Good Friday 2027", date: "2027-03-26" },
  { name: "Easter Monday 2027", date: "2027-03-29" },
  { name: "Anzac Day 2027", date: "2027-04-25" },
  { name: "Labour Day (QLD) 2027", date: "2027-05-03" },
  { name: "Mother's Day 2027", date: "2027-05-09" },
]

function formatHolidayDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function HolidayDropdown({ onSelect, disabled }: { onSelect: (q: string) => void, disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const nextHoliday = HOLIDAYS.find(h => new Date(h.date + 'T00:00:00') >= today)
  const pastHolidays = HOLIDAYS.filter(h => new Date(h.date + 'T00:00:00') < today).reverse()
  const futureHolidays = HOLIDAYS.filter(h => new Date(h.date + 'T00:00:00') >= today)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(name: string) {
    setOpen(false)
    onSelect(`What were the total sales on ${name}, what was the weather like, and what were the top selling food items (exclude coffees, drinks, and beverages from the product list)?`)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{
          padding: '6px 12px',
          borderRadius: 20,
          border: `1px solid ${open ? '#555' : '#333'}`,
          background: '#1a1a1a',
          color: open ? '#fff' : '#ccc',
          fontSize: 12,
          cursor: disabled ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        {nextHoliday ? `Next: ${nextHoliday.name}` : 'Holidays'}
        <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          zIndex: 100,
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 10,
          overflow: 'hidden',
          minWidth: 220,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {futureHolidays.length > 0 && (
            <>
              <div style={{ padding: '6px 12px 2px', fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Upcoming</div>
              {futureHolidays.map(h => (
                <button key={h.date} onClick={() => select(h.name)} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 14px', background: 'none', border: 'none',
                  color: h === nextHoliday ? '#fff' : '#bbb', fontSize: 13, cursor: 'pointer',
                  borderLeft: h === nextHoliday ? '2px solid #666' : '2px solid transparent',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#262626')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ flex: 1 }}>{h.name}</span>
                  <span style={{ float: 'right', color: '#555', fontSize: 11 }}>{formatHolidayDate(h.date)}</span>
                </button>
              ))}
            </>
          )}
          {pastHolidays.length > 0 && (
            <>
              <div style={{ padding: '8px 12px 2px', fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', borderTop: '1px solid #222' }}>Recent</div>
              {pastHolidays.slice(0, 6).map(h => (
                <button key={h.date} onClick={() => select(h.name)} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 14px', background: 'none', border: 'none',
                  color: '#888', fontSize: 13, cursor: 'pointer',
                  borderLeft: '2px solid transparent',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#262626')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {h.name}
                  <span style={{ float: 'right', color: '#444', fontSize: 11 }}>{formatHolidayDate(h.date)}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function AskPage() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession()
      if (!data.session) { window.location.href = '/login'; return }
      setEmail(data.session.user.email ?? null)
      setLoading(false)
    }
    check()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function ask(q?: string) {
    const text = (q ?? question).trim()
    if (!text || busy) return
    setBusy(true)
    setMsgs(m => [...m, { role: 'user', text }])
    setQuestion('')

    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text }),
    })
    const out = await res.json()
    setMsgs(m => [...m, { role: 'ai', text: out.answer ?? `Error: ${out.error ?? 'Unknown error'}` }])
    setBusy(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  if (loading) return <div style={{ padding: 40, color: '#fff' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <BpHeader email={email} onSignOut={signOut} activeTab="ask" />

      <div style={{
        flex: 1,
        minHeight: 0,
        maxWidth: 860,
        width: '100%',
        margin: '0 auto',
        padding: '24px 20px 16px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}>

      {/* Quick prompts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {QUICK_PROMPTS.map(p => (
          <button
            key={p.label}
            onClick={() => ask(p.q)}
            disabled={busy}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              border: '1px solid #333',
              background: '#1a1a1a',
              color: '#ccc',
              fontSize: 12,
              cursor: busy ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { if (!busy) { (e.target as HTMLElement).style.borderColor = '#555'; (e.target as HTMLElement).style.color = '#fff' } }}
            onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = '#333'; (e.target as HTMLElement).style.color = '#ccc' }}
          >
            {p.label}
          </button>
        ))}
        <HolidayDropdown onSelect={q => ask(q)} disabled={busy} />
      </div>

      {/* Conversation window */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        border: '1px solid #222',
        borderRadius: 12,
        padding: msgs.length === 0 ? '0' : '16px',
        marginBottom: 12,
        background: '#0d0d0d',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {msgs.length === 0 ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#444',
            fontSize: 14,
            padding: 40,
            textAlign: 'center',
          }}>
            Ask a question or pick a prompt above to get started.
          </div>
        ) : (
          msgs.map((m, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '78%',
                padding: '10px 14px',
                borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: m.role === 'user' ? '#2a2a2a' : '#161616',
                border: `1px solid ${m.role === 'user' ? '#3a3a3a' : '#222'}`,
                color: m.role === 'user' ? '#e0e0e0' : '#c8c8c8',
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: m.role === 'user' ? '#666' : '#555',
                  marginBottom: 4,
                }}>
                  {m.role === 'user' ? 'You' : 'AI'}
                </div>
                {m.text}
              </div>
            </div>
          ))
        )}

        {busy && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '10px 16px',
              borderRadius: '16px 16px 16px 4px',
              background: '#161616',
              border: '1px solid #222',
              color: '#555',
              fontSize: 13,
            }}>
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) ask() }}
          placeholder="Ask about sales, products, trends, weather…"
          disabled={busy}
          style={{
            flex: 1,
            padding: '11px 16px',
            borderRadius: 10,
            border: '1px solid #333',
            background: '#111',
            color: '#e0e0e0',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          onClick={() => ask()}
          disabled={busy || !question.trim()}
          style={{
            padding: '11px 20px',
            borderRadius: 10,
            border: 'none',
            background: busy || !question.trim() ? '#222' : '#fff',
            color: busy || !question.trim() ? '#444' : '#000',
            fontWeight: 600,
            fontSize: 14,
            cursor: busy || !question.trim() ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {busy ? '…' : 'Ask'}
        </button>
      </div>
      </div>
    </div>
  )
}
