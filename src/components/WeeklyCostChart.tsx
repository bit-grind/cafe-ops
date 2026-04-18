'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtDate, money } from '@/app/lib/fmt'

export type WeekRow = { week_start: string; week_end: string; total: number }

type Props = {
  weeks: WeekRow[]
  /** Override height. Defaults to 280 on mobile (<500px) and 240 on desktop. */
  height?: number
}

/**
 * Interactive bar chart for weekly supplier cost. Pure SVG — no chart
 * library. On desktop the chart fits the container and shows a hover
 * tooltip; on mobile each bar gets a minimum slot width and the chart
 * scrolls horizontally with value labels sitting above every bar.
 */
export default function WeeklyCostChart({ weeks, height }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  // Match SVG user-space to container width so text and strokes render
  // at real pixel sizes.
  const [containerW, setContainerW] = useState(1000)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setContainerW(Math.max(280, el.clientWidth))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { max, avg } = useMemo(() => {
    if (weeks.length === 0) return { max: 0, avg: 0 }
    const totals = weeks.map(w => w.total)
    const max = Math.max(...totals, 1)
    const avg = totals.reduce((s, v) => s + v, 0) / totals.length
    return { max, avg }
  }, [weeks])

  const isNarrow = containerW < 500
  const H = height ?? (isNarrow ? 300 : 240)

  if (weeks.length === 0) {
    return (
      <div
        ref={wrapRef}
        style={{
          height: H,
          border: '1px solid var(--border)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted-strong)',
          fontSize: 13,
        }}
      >
        No data in range.
      </div>
    )
  }

  // Typography and spacing scale up on narrow viewports.
  const fsY = isNarrow ? 13 : 11
  const fsX = isNarrow ? 12 : 10
  const fsAvg = isNarrow ? 12 : 10
  const fsVal = 11
  const padL = isNarrow ? 58 : 56
  const padR = isNarrow ? 14 : 16
  const padT = isNarrow ? 26 : 14
  const padB = isNarrow ? 34 : 28

  // On mobile, each bar gets its own slot width so the chart scrolls
  // horizontally instead of cramming 52 bars into 300px.
  const n = weeks.length
  const minSlot = isNarrow ? 46 : 0
  const contentW = Math.max(containerW, padL + padR + n * minSlot)
  const scrolls = contentW > containerW

  const innerW = contentW - padL - padR
  const innerH = H - padT - padB
  const slot = innerW / n
  const barW = Math.max(4, Math.min(isNarrow ? 30 : 28, slot * 0.7))
  const yFor = (v: number) => padT + innerH * (1 - v / max)
  const avgY = yFor(avg)

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => ({ v: max * t, y: yFor(max * t) }))

  // X-axis labels. On mobile we have room for every bar (or every other
  // if too tight). On desktop, stride down to ~8 labels max.
  const maxLabels = isNarrow ? n : 8
  const labelStride = Math.max(1, Math.ceil(n / maxLabels))

  // Compact currency used for per-bar value labels on mobile.
  const shortMoney = (v: number) => {
    if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
    return `$${Math.round(v)}`
  }

  const hovered = hoverIdx !== null ? weeks[hoverIdx] : null

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        style={{
          overflowX: scrolls ? 'auto' : 'visible',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <svg
          viewBox={`0 0 ${contentW} ${H}`}
          width={contentW}
          height={H}
          style={{ display: 'block' }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={contentW - padR}
                y1={t.y}
                y2={t.y}
                stroke="var(--border)"
                strokeDasharray={i === 0 ? '0' : '2 4'}
              />
              <text
                x={padL - 8}
                y={t.y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={fsY}
                fill="var(--muted-strong)"
              >
                {money(t.v)}
              </text>
            </g>
          ))}

          <line
            x1={padL}
            x2={contentW - padR}
            y1={avgY}
            y2={avgY}
            stroke="#8a8a8a"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
          <text
            x={contentW - padR}
            y={avgY - 4}
            textAnchor="end"
            fontSize={fsAvg}
            fill="var(--muted-strong)"
          >
            avg {money(avg)}
          </text>

          {weeks.map((w, i) => {
            const cx = padL + slot * (i + 0.5)
            const y = yFor(w.total)
            const h = padT + innerH - y
            const active = hoverIdx === i
            return (
              <g key={w.week_start}>
                <rect
                  x={cx - slot / 2}
                  y={padT}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  onClick={() => setHoverIdx(prev => (prev === i ? null : i))}
                  style={{ cursor: 'pointer' }}
                />
                <rect
                  x={cx - barW / 2}
                  y={y}
                  width={barW}
                  height={Math.max(1, h)}
                  fill={active ? '#fff' : '#5b8ef7'}
                  rx={2}
                  pointerEvents="none"
                />
                {isNarrow && (
                  <text
                    x={cx}
                    y={y - 6}
                    textAnchor="middle"
                    fontSize={fsVal}
                    fill="var(--muted-strong)"
                    pointerEvents="none"
                  >
                    {shortMoney(w.total)}
                  </text>
                )}
                {i % labelStride === 0 && (
                  <text
                    x={cx}
                    y={H - 10}
                    textAnchor="middle"
                    fontSize={fsX}
                    fill="var(--muted-strong)"
                    pointerEvents="none"
                  >
                    {fmtDate(w.week_start).slice(0, 5)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {!isNarrow && hovered && hoverIdx !== null && (
        <div
          style={{
            position: 'absolute',
            left: `${(padL + slot * (hoverIdx + 0.5)) / contentW * 100}%`,
            top: 4,
            transform: 'translateX(-50%)',
            background: 'rgba(20,20,20,0.95)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          <div style={{ color: 'var(--muted-strong)' }}>
            {fmtDate(hovered.week_start)} – {fmtDate(hovered.week_end)}
          </div>
          <div style={{ fontWeight: 600, marginTop: 2 }}>{money(hovered.total)}</div>
        </div>
      )}

      {scrolls && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--muted-strong)',
            textAlign: 'center',
            marginTop: 6,
          }}
        >
          ← scroll →
        </div>
      )}
    </div>
  )
}
