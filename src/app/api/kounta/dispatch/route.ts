import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/serverAuth'
import { dispatchWorkflow } from '@/lib/githubDispatch'

/**
 * Protected manual/recovery kick for the Kounta live-sales monitor.
 *
 * GitHub's `schedule` trigger drops runs for hours at a time, which left the
 * dashboard with no current-day sales on mornings when the cron simply never
 * fired. The external 15-minute cron normally calls ensureLiveMonitor through
 * /api/extract-lines/cron; this endpoint provides a direct authenticated probe
 * and recovery path.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` (same as the
 * brief cron). Dispatching needs a GitHub token with `actions:write` on the
 * repo in `GH_DISPATCH_TOKEN`. Missing configuration is a service failure, not
 * a successful no-op, so monitoring can alert on it.
 */
const WORKFLOW = 'kounta-live-sales.yml'

async function handle(req: Request) {
  const authError = checkCronAuth(req)
  if (authError) return authError

  const token = process.env.GH_DISPATCH_TOKEN
  const repo = process.env.GH_DISPATCH_REPO ?? 'bit-grind/cafe-ops'
  const ref = process.env.GH_DISPATCH_REF ?? 'main'
  if (!token) {
    console.error('[kounta-dispatch] missing_dispatch_token')
    return NextResponse.json(
      { ok: false, dispatched: false, message: 'GH_DISPATCH_TOKEN not set' },
      { status: 503 },
    )
  }

  const result = await dispatchWorkflow(token, repo, WORKFLOW, ref, {
    continue_monitoring: 'true',
    monitor_minutes: '70',
    poll_seconds: '60',
  })
  if (result.ok) return NextResponse.json({ ok: true, dispatched: true })
  console.error(`[kounta-dispatch] dispatch_failed: ${result.status} ${result.message}`)
  return NextResponse.json(
    { ok: false, dispatched: false, status: result.status, message: result.message },
    { status: 502 },
  )
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
