import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { generateBrief } from '@/lib/brief'

export const maxDuration = 60

/**
 * Pre-generates the daily brief. Triggered by Vercel Cron (see vercel.json),
 * which sends `Authorization: Bearer <CRON_SECRET>`. Also callable manually
 * with an `x-cron-secret` header. Same auth convention as the extract-lines cron.
 */
function checkCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  const provided =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace('Bearer ', '')
  if (provided !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}

async function handle(req: Request) {
  const authError = checkCronAuth(req)
  if (authError) return authError
  try {
    const brief = await generateBrief(adminClient())
    if (!brief) return NextResponse.json({ ok: true, generated: false, message: 'No sales data yet' })
    return NextResponse.json({ ok: true, generated: true, brief_date: brief.brief_date })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
