'use client'

import { useEffect, useMemo, useState } from 'react'
import BpHeader from '@/components/BpHeader'
import { supabase } from '@/lib/supabaseClient'
import type { AppTab } from '@/lib/permissions'

type CalendarEventType = 'leave' | 'unavailable' | 'available' | 'shift'

type CalendarEvent = {
  id: string
  source: 'deputy' | 'zapier'
  externalId?: string | null
  employeeId?: number | null
  employeeName: string
  type: CalendarEventType
  status?: string | null
  start: string
  end: string
  dateStart: string
  dateEnd: string
  comment?: string | null
}

type CalendarResponse = {
  events: CalendarEvent[]
  fetched_at: string
}

type MeResponse = {
  email?: string | null
  allowedTabs?: AppTab[]
  isGuest?: boolean
}

const FILTERS: Array<{ key: CalendarEventType; label: string }> = [
  { key: 'shift', label: 'Shifts' },
  { key: 'unavailable', label: 'Unavailable' },
  { key: 'available', label: 'Available' },
  { key: 'leave', label: 'Leave' },
]

const TYPE_LABEL: Record<CalendarEventType, string> = {
  leave: 'Leave',
  unavailable: 'Unavailable',
  available: 'Available',
  shift: 'Shift',
}

const TYPE_COLOR: Record<CalendarEventType, string> = {
  leave: '#e6a15f',
  unavailable: '#e58080',
  available: '#5bd38b',
  shift: '#7ab8ff',
}

function isoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseIsoDay(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function monthRange(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const startOffset = (first.getDay() + 6) % 7
  const endOffset = 6 - ((last.getDay() + 6) % 7)
  const gridStart = addDays(first, -startOffset)
  const gridEnd = addDays(last, endOffset)
  return { first, last, gridStart, gridEnd }
}

function fmtMonth(date: Date) {
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(date)
}

function fmtTime(value: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function fmtDate(value: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(parseIsoDay(value))
}

function eventTouchesDay(event: CalendarEvent, day: string) {
  return event.dateStart <= day && event.dateEnd >= day
}

export default function TeamCalendarPage() {
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [allowedTabs, setAllowedTabs] = useState<AppTab[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [month, setMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() => isoDate(new Date()))
  const [filter, setFilter] = useState<CalendarEventType>('shift')

  useEffect(() => {
    async function init() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/login'
        return
      }

      const accessToken = sessionData.session.access_token
      setToken(accessToken)
      setEmail(sessionData.session.user.email ?? null)

      const meRes = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => null)

      if (meRes?.ok) {
        const me = await meRes.json() as MeResponse
        if (me.isGuest) {
          window.location.replace('/ops')
          return
        }
        setAllowedTabs(me.allowedTabs ?? [])
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    async function loadCalendar() {
      setCalendarLoading(true)
      const { gridStart, gridEnd } = monthRange(month)
      const res = await fetch(`/api/deputy/calendar?from=${isoDate(gridStart)}&to=${isoDate(gridEnd)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }).catch(() => null)

      if (cancelled) return
      if (res?.ok) {
        const body = await res.json() as CalendarResponse
        setEvents(body.events ?? [])
      } else {
        setEvents([])
      }
      setCalendarLoading(false)
    }
    loadCalendar()
    return () => { cancelled = true }
  }, [month, token])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const visibleEvents = useMemo(() => {
    return events.filter(event => event.type === filter)
  }, [events, filter])

  const days = useMemo(() => {
    const { gridStart, gridEnd } = monthRange(month)
    const out: Date[] = []
    for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) out.push(new Date(d))
    return out
  }, [month])

  const selectedEvents = visibleEvents
    .filter(event => eventTouchesDay(event, selectedDay))
    .sort((a, b) => a.start.localeCompare(b.start) || a.employeeName.localeCompare(b.employeeName))

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} activeTab="calendar" allowedTabs={allowedTabs} />

      <main className="bp-container">
        <div
          className="bp-page-toolbar"
          style={{
            marginTop: 22,
            marginBottom: 14,
            display: 'flex',
            alignItems: 'end',
            justifyContent: 'space-between',
            gap: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--muted-strong)',
                marginBottom: 8,
              }}
            >
              Team calendar
            </div>
            <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.1 }}>{fmtMonth(month)}</h1>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="bp-btn"
              type="button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              aria-label="Previous month"
              title="Previous month"
            >
              ‹
            </button>
            <button
              className="bp-btn"
              type="button"
              onClick={() => {
                const today = new Date()
                setMonth(today)
                setSelectedDay(isoDate(today))
              }}
            >
              Today
            </button>
            <button
              className="bp-btn"
              type="button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              aria-label="Next month"
              title="Next month"
            >
              ›
            </button>
          </div>
        </div>

        <div
          className="bp-chip-scroll"
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}
          aria-label="Calendar filters"
        >
          {FILTERS.map(item => (
            <button
              key={item.key}
              type="button"
              className="bp-chip"
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div
          className="bp-mobile-grid-one"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px)',
            gap: 14,
            alignItems: 'start',
          }}
        >
          <section className="bp-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                background: 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} style={{ padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--muted-strong)' }}>
                  {day}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
              {days.map(day => {
                const dayIso = isoDate(day)
                const inMonth = day.getMonth() === month.getMonth()
                const isSelected = dayIso === selectedDay
                const dayEvents = visibleEvents.filter(event => eventTouchesDay(event, dayIso))
                return (
                  <button
                    key={dayIso}
                    type="button"
                    onClick={() => setSelectedDay(dayIso)}
                    style={{
                      minHeight: 118,
                      padding: 8,
                      border: 0,
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      background: isSelected ? 'rgba(255,255,255,0.07)' : 'transparent',
                      color: inMonth ? 'var(--foreground)' : 'rgba(255,255,255,0.34)',
                      textAlign: 'left',
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 600 }}>{day.getDate()}</span>
                      {dayEvents.length > 3 ? (
                        <span style={{ fontSize: 10, color: 'var(--muted-strong)' }}>+{dayEvents.length - 3}</span>
                      ) : null}
                    </div>
                    <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
                      {dayEvents.slice(0, 3).map(event => (
                        <div
                          key={`${dayIso}-${event.id}`}
                          title={`${event.employeeName}: ${TYPE_LABEL[event.type]}`}
                          style={{
                            minWidth: 0,
                            borderLeft: `3px solid ${TYPE_COLOR[event.type]}`,
                            background: 'rgba(255,255,255,0.05)',
                            padding: '4px 6px',
                            borderRadius: 6,
                            fontSize: 11,
                            color: inMonth ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.42)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {event.employeeName}
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <aside style={{ display: 'grid', gap: 14 }}>
            <section className="bp-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted-strong)', marginBottom: 6 }}>Selected day</div>
                  <h2 style={{ margin: 0, fontSize: 20 }}>{fmtDate(selectedDay)}</h2>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted-strong)' }}>{selectedEvents.length} events</div>
              </div>

              <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                {calendarLoading ? (
                  <div style={{ color: 'var(--muted-strong)', fontSize: 13 }}>Loading calendar...</div>
                ) : selectedEvents.length === 0 ? (
                  <div style={{ color: 'var(--muted-strong)', fontSize: 13 }}>No leave or availability recorded.</div>
                ) : (
                  selectedEvents.map(event => (
                    <div
                      key={event.id}
                      style={{
                        borderLeft: `3px solid ${TYPE_COLOR[event.type]}`,
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: 8,
                        padding: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ fontWeight: 700 }}>{event.employeeName}</div>
                        <div style={{ color: TYPE_COLOR[event.type], fontSize: 12, fontWeight: 700 }}>
                          {TYPE_LABEL[event.type]}
                        </div>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted-strong)' }}>
                        {fmtTime(event.start)} - {fmtTime(event.end)}
                        {event.status ? ` · ${event.status}` : ''}
                      </div>
                      {event.comment ? (
                        <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.78)' }}>{event.comment}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
