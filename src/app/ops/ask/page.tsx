'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Msg = { role: 'user' | 'ai', text: string }

export default function AskPage() {
  const [loading, setLoading] = useState(true)
  const [question, setQuestion] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        window.location.href = '/login'
        return
      }
      setLoading(false)
    }
    check()
  }, [])

  async function ask() {
    const q = question.trim()
    if (!q || busy) return

    setBusy(true)
    setMsgs((m) => [...m, { role: 'user', text: q }])
    setQuestion('')

    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    })

    const out = await res.json()
    if (out.answer) {
      setMsgs((m) => [...m, { role: 'ai', text: out.answer }])
    } else {
      setMsgs((m) => [...m, { role: 'ai', text: `Error: ${out.error ?? 'Unknown error'}` }])
    }

    setBusy(false)
  }

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h1>Ask AI</h1>
      <p>Ask questions about the last 7 business days.</p>

      <div style={{ display: 'flex', gap: 10 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Why was today lower than yesterday?"
          style={{ flex: 1, padding: 10 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ask()
          }}
        />
        <button onClick={ask} disabled={busy} style={{ padding: '10px 14px' }}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700 }}>{m.role === 'user' ? 'You' : 'AI'}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, color: '#666' }}>
        <button
          onClick={() => setQuestion('Compare today to the last 7 days average. What stands out?')}
          style={{ marginRight: 10 }}
        >
          Quick: Today vs average
        </button>
        <button
          onClick={() => setQuestion('Any trend over the last 7 days? What would you do next week?')}
        >
          Quick: Trend + actions
        </button>
      </div>
    </div>
  )
}
