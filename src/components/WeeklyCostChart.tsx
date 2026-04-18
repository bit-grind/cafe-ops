'use client'

import { useMemo, useState } from 'react'
import { fmtDate, money } from '@/app/lib/fmt'

export type WeekRow = { week_start: string; week_end: string; total: number }

type Props = {
  weeks: WeekRow[]
  height?: number
}

/**
 * Interactive bar chart for weekly supplier cost. Pure SVG so we don't
 * have to pull in a chart library. Hovering (or tapping) a bar shows a
 * tooltip with the week range and amount.
 */
export default function WeeklyCostChart({ weeks, height = 240 }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const { max, avg } = useMemo(() => {
    if (weeks.length === 0) return { max: 0, avg: 0 }
    const totals = weeks.map(w => w.total)
    const max = Math.max(...totals, 1)
    const avg = totals.reduce((s, v) => s + v, 0) / totals.length
    return { max, avg }
  }, [weeks])

  if (weeks.length === 0) {
    return (
      <div
        style={{
          height,
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

  // Layout in SVG user-space units. The SVG itself scales responsively.
  const W = 1000
  const H = height
  const padL = 56
  const padR = 16
  const padT = 14
  const padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const n = weeks.length
  const slot = innerW / n
  const barW = Math.max(2, Math.min(28, slot * 0.7))
  const yFor = (v: number) => padT + innerH * (1 - v / max)
  const avgY = yFor(avg)

  // Y-axis ticks at 0, 25, 50, 75, 100% of max — keeps labels readable.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => ({ v: max * t, y: yFor(max * t) }))

  // X-axis labels: show at most ~8 labels to avoid crowding.
  const labelStride = Math.max(1, Math.ceil(n / 8))

  const hovered = hoverIdx !== null ? weeks[hoverIdx] : null

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
        style={{ display: 'block' }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
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
              fontSize={11}
              fill="var(--muted-strong)"
            >
              {money(t.v)}
            </text>
          </g>
        ))}

        <line
          x1={padL}
          x2={W - padR}
          y1={avgY}
          y2={avgY}
          stroke="#8a8a8a"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <text
          x={W - padR}
          y={avgY - 4}
          textAnchor="end"
          fontSize={10}
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
              {i % labelStride === 0 && (
                <text
                  x={cx}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--muted-strong)"
                >
                  {fmtDate(w.week_start).slice(0, 5)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {hovered && hoverIdx !== null && (
        <div
          style={{
            position: 'absolute',
            left: `${(padL + slot * (hoverIdx + 0.5)) / W * 100}%`,
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
    </div>
  )
}
