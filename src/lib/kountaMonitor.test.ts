import { describe, expect, it } from 'vitest'
import { shouldKickMonitor } from './kountaMonitor'

const NOON = 12 * 60 // Brisbane minute well inside trading
const now = Date.UTC(2026, 5, 19, 2, 0, 0) // arbitrary "now" in ms

describe('shouldKickMonitor', () => {
  it('does not kick outside trading hours', () => {
    expect(shouldKickMonitor({ brisbaneMinute: 3 * 60, lastUpdateMs: null, nowMs: now })).toBe(false) // 03:00
    expect(shouldKickMonitor({ brisbaneMinute: 15 * 60, lastUpdateMs: null, nowMs: now })).toBe(false) // 15:00
  })

  it('kicks when there is no sales row yet during trading', () => {
    expect(shouldKickMonitor({ brisbaneMinute: NOON, lastUpdateMs: null, nowMs: now })).toBe(true)
  })

  it('kicks when the sales row has gone stale (monitor dead)', () => {
    const stale = now - 12 * 60 * 1000
    expect(shouldKickMonitor({ brisbaneMinute: NOON, lastUpdateMs: stale, nowMs: now })).toBe(true)
  })

  it('does not kick when a healthy monitor updated recently', () => {
    const fresh = now - 90 * 1000 // 90s ago — monitor polling every 60s
    expect(shouldKickMonitor({ brisbaneMinute: NOON, lastUpdateMs: fresh, nowMs: now })).toBe(false)
  })

  it('treats the trading window edges inclusively at open, exclusively at close', () => {
    expect(shouldKickMonitor({ brisbaneMinute: 4 * 60, lastUpdateMs: null, nowMs: now })).toBe(true) // 04:00 open
    expect(shouldKickMonitor({ brisbaneMinute: 14 * 60 + 20, lastUpdateMs: null, nowMs: now })).toBe(false) // 14:20 close
  })
})
