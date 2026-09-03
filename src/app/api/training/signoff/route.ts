import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { internalError } from '@/lib/apiError'
import { CONTENT_VERSION } from '@/lib/training/content'
import { isCourseComplete } from '@/lib/training/progress'
import { resolveTrainee } from '@/lib/training/traineeAuth'

const MAX_BODY_BYTES = 2_000
const MAX_NAME_LENGTH = 120

/**
 * POST /api/training/signoff — the trainee's declaration that they've read and
 * understood the course.
 *
 * The original course let the browser decide whether all ten modules were
 * done and then fired a mailto. This is an employment record, so completion
 * is re-checked server-side against stored progress before anything is
 * stamped.
 */
export async function POST(req: Request) {
  const trainee = await resolveTrainee(req)
  if (!trainee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 400 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const fullName = typeof (body as { fullName?: unknown })?.fullName === 'string'
    ? (body as { fullName: string }).fullName.trim()
    : ''
  if (!fullName) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  if (fullName.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: 'Name too long' }, { status: 400 })
  }

  const db = adminClient()

  const { data: rows, error: readError } = await db
    .from('training_module_progress')
    .select('module_id')
    .eq('trainee_id', trainee.id)

  if (readError) return internalError('Training signoff read failed', readError, 'Failed to sign off')

  const completedIds = (rows ?? []).map(r => r.module_id as string)
  if (!isCourseComplete(completedIds)) {
    return NextResponse.json({ error: 'Finish every module before signing off' }, { status: 400 })
  }

  // Already signed: return the existing stamp rather than moving the date.
  // Normalised to ISO so this path and the one below agree on format —
  // Postgres round-trips as "+00:00" where `toISOString` gives "Z".
  if (trainee.signed_off_at) {
    return NextResponse.json({
      ok: true,
      signedOffAt: new Date(trainee.signed_off_at).toISOString(),
      signedOffName: trainee.signed_off_name,
    })
  }

  const now = new Date().toISOString()
  const { error: writeError } = await db
    .from('training_trainee')
    .update({
      signed_off_at: now,
      signed_off_name: fullName,
      content_version: CONTENT_VERSION,
      updated_at: now,
    })
    .eq('id', trainee.id)

  if (writeError) return internalError('Training signoff write failed', writeError, 'Failed to sign off')

  return NextResponse.json({ ok: true, signedOffAt: now, signedOffName: fullName })
}
