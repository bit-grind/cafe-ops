'use client'

import { useEffect, useMemo, useState } from 'react'
import BpHeader from '@/components/BpHeader'
import { supabase } from '@/lib/supabaseClient'
import type { AppTab } from '@/lib/permissions'

type CalendarEventType = 'leave' | 'unavailable' | 'available' | 'shift' | 'birthday'

type CalendarEvent = {
  id: string
  source: 'deputy' | 'zapier'
  externalId?: string | null
  employeeId?: number | null
  employeeName: string
  type: CalendarEventType
  status?: string | null
  areaId?: number | null
  areaName?: string | null
  areaColor?: string | null
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
  { key: 'birthday', label: 'Birthdays' },
  { key: 'unavailable', label: 'Unavailable' },
  { key: 'available', label: 'Available' },
  { key: 'leave', label: 'Leave' },
]

const TYPE_LABEL: Record<CalendarEventType, string> = {
  leave: 'Leave',
  unavailable: 'Unavailable',
  available: 'Available',
  shift: 'Shift',
  birthday: 'Birthday',
}

const TYPE_COLOR: Record<CalendarEventType, string> = {
  leave: '#e6a15f',
  unavailable: '#e58080',
  available: '#5bd38b',
  shift: '#7ab8ff',
  birthday: '#f4cf65',
}

const FALLBACK_AREA_COLOR: Record<string, string> = {
  Kitchen: '#f0a35e',
  'Shift Supervisor': '#c9a5ff',
  Barista: '#64d6c2',
  Pourer: '#f4cf65',
  Till: '#8eb8ff',
  Runner: '#ff8aa6',
  BBQ: '#ff9f7a',
  FOH: '#9bd66f',
}

const AREA_ORDER = ['Barista', 'Pourer', 'Till', 'Runner', 'Kitchen', 'BBQ']

function areaSortValue(area: string) {
  const normalized = area === 'Runners' ? 'Runner' : area
  const index = AREA_ORDER.indexOf(normalized)
  return index === -1 ? AREA_ORDER.length : index
}

function eventColor(event: CalendarEvent) {
  if (event.type === 'shift' && event.areaColor) return event.areaColor
  if (event.type === 'shift' && event.areaName && FALLBACK_AREA_COLOR[event.areaName]) return FALLBACK_AREA_COLOR[event.areaName]
  return TYPE_COLOR[event.type]
}

function employeeInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

function groupedDayEvents(events: CalendarEvent[]) {
  const groups = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const key = event.type === 'shift' ? event.areaName ?? 'Unassigned' : TYPE_LABEL[event.type]
    const group = groups.get(key) ?? []
    group.push(event)
    groups.set(key, group)
  }
  return Array.from(groups.entries()).map(([label, group]) => ({
    label,
    events: group,
    color: eventColor(group[0]),
  })).sort((a, b) => areaSortValue(a.label) - areaSortValue(b.label) || a.label.localeCompare(b.label))
}

function orderedDayBubbles(events: CalendarEvent[]) {
  return groupedDayEvents(events).flatMap(group => group.events)
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

function eventTitle(event: CalendarEvent) {
  if (event.type === 'birthday') return `${event.employeeName} · Birthday`
  return `${event.employeeName}${event.areaName ? ` · ${event.areaName}` : ''}: ${fmtTime(event.start)} - ${fmtTime(event.end)}`
}

function eventAriaLabel(event: CalendarEvent) {
  if (event.type === 'birthday') return `${event.employeeName}, Birthday`
  return `${event.employeeName}${event.areaName ? `, ${event.areaName}` : ''}`
}

function eventTimeLabel(event: CalendarEvent) {
  return event.type === 'birthday'
    ? 'All day'
    : `${fmtTime(event.start)} - ${fmtTime(event.end)}`
}

// Shift length in ms; used to order rostered staff longest-first within a group.
function eventDurationMs(event: CalendarEvent) {
  const ms = new Date(event.end).getTime() - new Date(event.start).getTime()
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

function emptySelectedMessage(filter: CalendarEventType) {
  if (filter === 'birthday') return 'No staff birthdays.'
  if (filter === 'shift') return 'No shifts rostered.'
  return `No ${TYPE_LABEL[filter].toLowerCase()} recorded.`
}

function countLabel(count: number, filter: CalendarEventType) {
  if (filter === 'shift') return `${count} staff`
  const noun = filter === 'birthday' ? 'birthday' : 'event'
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function eventTouchesDay(event: CalendarEvent, day: string) {
  return event.dateStart <= day && event.dateEnd >= day
}

function uniqueEventsForDay(events: CalendarEvent[], day: string) {
  const seen = new Set<string>()
  return events.filter(event => {
    if (event.type === 'shift') return true
    const key = `${event.type}-${event.employeeId ?? event.employeeName}-${day}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
  const uniqueSelectedEvents = uniqueEventsForDay(selectedEvents, selectedDay)
  uniqueSelectedEvents
    .sort((a, b) => {
      const areaDiff = areaSortValue(a.areaName ?? TYPE_LABEL[a.type]) - areaSortValue(b.areaName ?? TYPE_LABEL[b.type])
      return areaDiff
        || eventDurationMs(b) - eventDurationMs(a)
        || a.start.localeCompare(b.start)
        || a.employeeName.localeCompare(b.employeeName)
    })
  const areaLegend = useMemo(() => {
    const areas = new Map<string, string>()
    for (const event of events) {
      if (event.type !== 'shift' || !event.areaName) continue
      if (!areas.has(event.areaName)) areas.set(event.areaName, eventColor(event))
    }
    return Array.from(areas.entries()).sort(([a], [b]) => areaSortValue(a) - areaSortValue(b) || a.localeCompare(b))
  }, [events])

  return (
    <div>
      <BpHeader email={email} onSignOut={signOut} activeTab="calendar" allowedTabs={allowedTabs} />

      <main className="bp-container" style={{ maxWidth: 1320 }}>
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
          className="bp-mobile-grid-one bp-calendar-layout"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(760px, 1fr) minmax(410px, 440px)',
            gap: 14,
            alignItems: 'start',
          }}
        >
          <div className="bp-calendar-main" style={{ display: 'grid', gap: 10 }}>
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
                  const dayEvents = uniqueEventsForDay(visibleEvents.filter(event => eventTouchesDay(event, dayIso)), dayIso)
                  const orderedEvents = orderedDayBubbles(dayEvents)
                  const visibleDayEvents = orderedEvents.slice(0, 24)
                  // Only a handful of names fit as full-width rows; busier days fall back to initials.
                  const showFullNames = dayEvents.length > 0 && dayEvents.length <= 3
                  // Busy days pack tighter so every name still fits and fills the cell width.
                  const denseBubbles = dayEvents.length > 9
                  const markerMinWidth = denseBubbles ? 26 : 32
                  const markerHeight = denseBubbles ? 16 : 20
                  const markerGap = denseBubbles ? 3 : 4
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
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 600 }}>{day.getDate()}</span>
                        {dayEvents.length > 0 ? (
                          <span
                            title={`${dayEvents.length} staff`}
                            style={{
                              fontSize: 10,
                              color: 'var(--muted-strong)',
                              fontWeight: 800,
                            }}
                          >
                            {dayEvents.length}
                          </span>
                        ) : null}
                      </div>
                      {showFullNames ? (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {orderedEvents.map(event => (
                            <span
                              key={`${dayIso}-${event.id}`}
                              title={eventTitle(event)}
                              aria-label={eventAriaLabel(event)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                height: 18,
                                padding: '0 6px 0 5px',
                                borderRadius: 5,
                                overflow: 'hidden',
                                background: 'rgba(255,255,255,0.08)',
                                color: inMonth ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.48)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                                opacity: inMonth ? 1 : 0.45,
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  flex: '0 0 auto',
                                  width: 3,
                                  height: 12,
                                  borderRadius: 2,
                                  background: inMonth ? eventColor(event) : 'rgba(255,255,255,0.2)',
                                }}
                              />
                              <span
                                style={{
                                  minWidth: 0,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  lineHeight: 1,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {event.employeeName}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div
                          style={{
                            marginTop: 8,
                            display: 'grid',
                            gridTemplateColumns: `repeat(auto-fit, minmax(${markerMinWidth}px, 1fr))`,
                            gridAutoRows: markerHeight,
                            gap: markerGap,
                            alignContent: 'start',
                          }}
                        >
                          {visibleDayEvents.map(event => (
                            <span
                              key={`${dayIso}-${event.id}`}
                              title={eventTitle(event)}
                              aria-label={eventAriaLabel(event)}
                              style={{
                                width: '100%',
                                height: markerHeight,
                                borderRadius: 5,
                                display: 'grid',
                                gridTemplateRows: `${denseBubbles ? 4 : 5}px 1fr`,
                                overflow: 'hidden',
                                background: 'rgba(255,255,255,0.08)',
                                color: inMonth ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.48)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                                fontSize: denseBubbles ? 8 : 9,
                                fontWeight: 900,
                                letterSpacing: 0,
                                lineHeight: 1,
                                opacity: inMonth ? 1 : 0.45,
                              }}
                            >
                              <span aria-hidden="true" style={{ background: inMonth ? eventColor(event) : 'rgba(255,255,255,0.2)' }} />
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  minWidth: 0,
                                }}
                              >
                                {employeeInitials(event.employeeName)}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>

            {filter === 'shift' && areaLegend.length > 0 ? (
              <section className="bp-card" style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'center' }}>
                  {areaLegend.map(([area, color]) => (
                    <div key={area} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-strong)' }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: color,
                          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.24)',
                        }}
                      />
                      <span>{area}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="bp-calendar-selected" style={{ display: 'grid', gap: 14 }}>
            <section className="bp-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20 }}>{fmtDate(selectedDay)}</h2>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted-strong)' }}>{countLabel(uniqueSelectedEvents.length, filter)}</div>
              </div>

              <div
                style={{
                  marginTop: 16,
                  display: 'grid',
                  gap: 12,
                }}
              >
                {calendarLoading ? (
                  <div style={{ color: 'var(--muted-strong)', fontSize: 13 }}>Loading calendar...</div>
                ) : uniqueSelectedEvents.length === 0 ? (
                  <div style={{ color: 'var(--muted-strong)', fontSize: 13 }}>{emptySelectedMessage(filter)}</div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: 10,
                    }}
                  >
                    {uniqueSelectedEvents.map(event => {
                      const roleLabel = event.type === 'shift' ? event.areaName ?? 'Unassigned' : TYPE_LABEL[event.type]
                      const color = eventColor(event)
                      return (
                        <div
                          key={event.id}
                          title={eventTitle(event)}
                          style={{
                            minWidth: 0,
                            borderLeft: `3px solid ${color}`,
                            background: 'rgba(255,255,255,0.04)',
                            borderRadius: 8,
                            padding: '9px 10px',
                          }}
                        >
                          <div
                            style={{
                              minWidth: 0,
                              fontWeight: 700,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {event.employeeName}
                          </div>
                          <div
                            style={{
                              marginTop: 5,
                              color,
                              fontSize: 11,
                              fontWeight: 700,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {roleLabel}
                          </div>
                          <div style={{ marginTop: 5, fontSize: 12, color: 'var(--muted-strong)' }}>
                            {eventTimeLabel(event)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
