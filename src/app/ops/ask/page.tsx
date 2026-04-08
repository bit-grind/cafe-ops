'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Msg = { role: 'user' | 'ai', text: string }

const QUICK_PROMPTS = [
  { label: 'Top products this week', q: 'What were our top selling products this week?' },
  { label: 'Today vs last week', q: 'How does today compare to the same day last week?' },
  { label: 'Best day last month', q: 'What was our best day last month and what drove it?' },
  { label: 'Top products last year', q: 'What were our most popular products last year?' },
  { label: '30-day trend', q: 'What is the sales trend over the last 30 days? What should we do next week?' },
  { label: "Last Mother's Day", q: "What were our top selling items on last Mother's Day and what was the weather like?" },
  { label: 'Worst day this year', q: 'What was our worst performing day this year and why might that be?' },
  { label: 'This month vs last', q: 'How is this month tracking compared to last month?' },
]

export default function AskPage() {
  const [loading, setLoading] = useState(true)
  const [question, setQuestion] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession()
      if (!data.session) { window.location.href = '/login'; return }
      setLoading(false)
    }
    check()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

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
    <div style={{
      maxWidth: 860,
      margin: '0 auto',
      padding: '32px 24px',
      fontFamily: 'system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 80px)',
      boxSizing: 'border-box',
    }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#fff' }}>Ask AI</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>
          Ask anything about your sales — products, trends, specific dates, weather, holidays.
        </p>
      </div>

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
  )
}
