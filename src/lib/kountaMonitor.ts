import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchWorkflow } from '@/lib/githubDispatch'

// Self-healing trigger for the Kounta live-sales monitor.
//
// The monitor is a self-chaining GitHub Actions job. Its weak point is getting
// *started*: GitHub's `schedule` trigger drops runs for hours, so on bad
// mornings nothing kicks it off and current-day sales never import. Vercel Cron
// is not reliable on this project (Hobby), but an external cron hits
// /api/extract-lines/cron every ~15 min and is rock-solid. We piggyback on that:
// every cron tick, if we're in trading hours and the live sales row has gone
// stale (monitor dead or never started), dispatch a fresh monitor. Detection
// latency is one cron interval; a healthy monitor (polls every 60s) never trips
// the staleness check, and overlapping dispatches queue harmlessly behind the
// running monitor (workflow concurrency is cancel-in-progress: false).

const WORKFLOW = 'kounta-live-sales.yml'

// Brisbane minutes-of-day. Cafe trades ~05:00–14:20; the workflow's own self
// window is 04:00–14:20 (LIVE_STOP_BRISBANE=14:20), so match it.
const TRADING_START_MIN = 4 * 60 // 04:00
const TRADING_STOP_MIN = 14 * 60 + 20 // 14:20

// A live monitor updates sales_business_day every poll (~60s). If the row for
// today hasn't moved in this long, the monitor is dead/absent — kick it. Well
// above the poll interval (no false positives) and below the cron interval.
const STALE_MS = 10 * 60 * 1000

export function brisbaneMinuteOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Brisbane',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')!.value)
  const minute = Number(parts.find((p) => p.type === 'minute')!.value)
  return hour * 60 + minute
}

/**
 * Pure decision: should we dispatch a monitor right now? True only inside the
 * trading window AND when today's sales are missing or stale. `lastUpdateMs` is
 * the epoch ms of today's sales row `updated_at`, or null if there is no row.
 */
export function shouldKickMonitor(input: {
  brisbaneMinute: number
  lastUpdateMs: number | null
  nowMs: number
}): boolean {
  const { brisbaneMinute, lastUpdateMs, nowMs } = input
  if (brisbaneMinute < TRADING_START_MIN || brisbaneMinute >= TRADING_STOP_MIN) return false
  if (lastUpdateMs === null) return true
  return nowMs - lastUpdateMs > STALE_MS
}

function brisbaneDateString(now: Date): string {
  // en-CA gives YYYY-MM-DD; matches how business days are keyed elsewhere.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(now)
}

export type EnsureResult =
  | { dispatched: false; reason: string }
  | { dispatched: true }

/**
 * Ensure a live monitor is running if it should be. Safe to call on every cron
 * tick. Never throws — callers (e.g. the bills cron) must not be affected.
 */
export async function ensureLiveMonitor(supabase: SupabaseClient): Promise<EnsureResult> {
  try {
    const token = process.env.GH_DISPATCH_TOKEN
    if (!token) return { dispatched: false, reason: 'no GH_DISPATCH_TOKEN' }

    const now = new Date()
    const brisbaneMinute = brisbaneMinuteOfDay(now)
    const today = brisbaneDateString(now)

    const { data } = await supabase
      .from('sales_business_day')
      .select('updated_at')
      .eq('business_date', today)
      .maybeSingle()

    const lastUpdateMs = data?.updated_at ? new Date(data.updated_at).getTime() : null
    if (!shouldKickMonitor({ brisbaneMinute, lastUpdateMs, nowMs: now.getTime() })) {
      return { dispatched: false, reason: 'monitor healthy or outside trading window' }
    }

    const repo = process.env.GH_DISPATCH_REPO ?? 'bit-grind/cafe-ops'
    const ref = process.env.GH_DISPATCH_REF ?? 'main'
    const result = await dispatchWorkflow(token, repo, WORKFLOW, ref, {
      continue_monitoring: 'true',
      monitor_minutes: '70',
      poll_seconds: '60',
    })
    if (result.ok) return { dispatched: true }
    return { dispatched: false, reason: `dispatch failed: ${result.status} ${result.message}` }
  } catch (e: unknown) {
    return { dispatched: false, reason: e instanceof Error ? e.message : 'unknown error' }
  }
}
