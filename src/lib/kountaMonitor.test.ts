import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchWorkflow } from '@/lib/githubDispatch'
import { ensureLiveMonitor, shouldKickMonitor } from './kountaMonitor'

vi.mock('@/lib/githubDispatch', () => ({ dispatchWorkflow: vi.fn() }))

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

function supabaseWithSalesResult(result: { data: { updated_at: string } | null; error: { message: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { client: { from } as unknown as SupabaseClient, from }
}

describe('ensureLiveMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-19T02:00:00Z')) // 12:00 Brisbane
    vi.unstubAllEnvs()
    vi.mocked(dispatchWorkflow).mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not require dispatch configuration outside trading hours', async () => {
    vi.setSystemTime(new Date('2026-06-18T17:00:00Z')) // 03:00 Brisbane
    const { client, from } = supabaseWithSalesResult({ data: null, error: null })

    await expect(ensureLiveMonitor(client)).resolves.toEqual({
      ok: true,
      dispatched: false,
      reason: 'outside_trading_window',
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('reports missing dispatch configuration when sales need recovery', async () => {
    const { client } = supabaseWithSalesResult({ data: null, error: null })

    await expect(ensureLiveMonitor(client)).resolves.toEqual({
      ok: false,
      dispatched: false,
      reason: 'missing_dispatch_token',
    })
    expect(console.error).toHaveBeenCalledWith('[kounta-monitor] missing_dispatch_token')
  })

  it('reports a sales status query failure instead of dispatching blindly', async () => {
    const { client } = supabaseWithSalesResult({ data: null, error: { message: 'database unavailable' } })

    await expect(ensureLiveMonitor(client)).resolves.toEqual({
      ok: false,
      dispatched: false,
      reason: 'sales_status_query_failed',
    })
    expect(dispatchWorkflow).not.toHaveBeenCalled()
  })

  it('stays healthy without a token when the live monitor updated recently', async () => {
    const { client } = supabaseWithSalesResult({
      data: { updated_at: '2026-06-19T01:59:00Z' },
      error: null,
    })

    await expect(ensureLiveMonitor(client)).resolves.toEqual({
      ok: true,
      dispatched: false,
      reason: 'monitor_healthy',
    })
    expect(dispatchWorkflow).not.toHaveBeenCalled()
  })

  it('dispatches a replacement monitor when sales are stale', async () => {
    vi.stubEnv('GH_DISPATCH_TOKEN', 'test-token')
    vi.mocked(dispatchWorkflow).mockResolvedValue({ ok: true })
    const { client } = supabaseWithSalesResult({
      data: { updated_at: '2026-06-19T01:45:00Z' },
      error: null,
    })

    await expect(ensureLiveMonitor(client)).resolves.toEqual({
      ok: true,
      dispatched: true,
      reason: 'monitor_dispatched',
    })
    expect(dispatchWorkflow).toHaveBeenCalledWith(
      'test-token',
      'bit-grind/cafe-ops',
      'kounta-live-sales.yml',
      'main',
      { continue_monitoring: 'true', monitor_minutes: '70', poll_seconds: '60' },
    )
  })

  it('reports GitHub dispatch failures with the HTTP status', async () => {
    vi.stubEnv('GH_DISPATCH_TOKEN', 'test-token')
    vi.mocked(dispatchWorkflow).mockResolvedValue({ ok: false, status: 403, message: 'Forbidden' })
    const { client } = supabaseWithSalesResult({ data: null, error: null })

    await expect(ensureLiveMonitor(client)).resolves.toEqual({
      ok: false,
      dispatched: false,
      reason: 'dispatch_failed',
      status: 403,
    })
  })
})
