import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/serverAuth'
import { dispatchWorkflow } from '@/lib/githubDispatch'

/**
 * Reliable morning kick for the Kounta live-sales monitor.
 *
 * GitHub's `schedule` trigger drops runs for hours at a time, which left the
 * dashboard with no current-day sales on mornings when the cron simply never
 * fired. Vercel Cron (see vercel.json) is reliable, so we use it to start the
 * self-chaining live monitor each trading morning. Once started the monitor
 * chains its own successors until close, so a single daily kick is enough; the
 * GitHub crons remain as redundant backups (they now queue behind a running
 * monitor instead of cancelling it).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` (same as the
 * brief cron). Dispatching needs a GitHub token with `actions:write` on the
 * repo in `GH_DISPATCH_TOKEN`; if it is unset the route is a clean no-op so a
 * deploy never breaks before the secret is provisioned.
 */
const WORKFLOW = 'kounta-live-sales.yml'

async function handle(req: Request) {
  const authError = checkCronAuth(req)
  if (authError) return authError

  const token = process.env.GH_DISPATCH_TOKEN
  const repo = process.env.GH_DISPATCH_REPO ?? 'bit-grind/cafe-ops'
  const ref = process.env.GH_DISPATCH_REF ?? 'main'
  if (!token) {
    return NextResponse.json(
      { ok: false, dispatched: false, message: 'GH_DISPATCH_TOKEN not set' },
      { status: 200 },
    )
  }

  const result = await dispatchWorkflow(token, repo, WORKFLOW, ref, {
    continue_monitoring: 'true',
    monitor_minutes: '70',
    poll_seconds: '60',
  })
  if (result.ok) return NextResponse.json({ ok: true, dispatched: true })
  return NextResponse.json(
    { ok: false, dispatched: false, status: result.status, message: result.message },
    { status: 502 },
  )
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
