import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { internalError } from '@/lib/apiError'
import { hasPassed, isUnlocked, quizTotal } from '@/lib/training/progress'
import { resolveTrainee } from '@/lib/training/traineeAuth'

const MAX_BODY_BYTES = 2_000

/**
 * POST /api/training/progress — record a passed module.
 *
 * Everything the client asserts is re-checked here. The quiz length comes
 * from the course content, never from the request, and a module can only be
 * recorded once the one before it is genuinely done — otherwise a trainee
 * could post `{ score: 1, total: 1 }` at module 10 and skip the course.
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

  const { moduleId, score } = (body ?? {}) as { moduleId?: unknown; score?: unknown }
  if (typeof moduleId !== 'string') {
    return NextResponse.json({ error: 'moduleId required' }, { status: 400 })
  }

  // The authoritative total — the client's own `total` is ignored entirely.
  const total = quizTotal(moduleId)
  if (total === null) return NextResponse.json({ error: 'Unknown module' }, { status: 400 })

  if (!Number.isInteger(score) || (score as number) < 0 || (score as number) > total) {
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 })
  }
  if (!hasPassed(score as number, total)) {
    return NextResponse.json({ error: 'Module not passed' }, { status: 400 })
  }

  const db = adminClient()

  const { data: existingRows, error: readError } = await db
    .from('training_module_progress')
    .select('module_id, attempts')
    .eq('trainee_id', trainee.id)

  if (readError) return internalError('Training progress read failed', readError, 'Failed to save progress')

  const completedIds = (existingRows ?? []).map(r => r.module_id as string)
  if (!isUnlocked(moduleId, completedIds)) {
    return NextResponse.json({ error: 'Module is locked' }, { status: 400 })
  }

  const existing = (existingRows ?? []).find(r => r.module_id === moduleId)
  const now = new Date().toISOString()

  const { error: writeError } = await db.from('training_module_progress').upsert(
    {
      trainee_id: trainee.id,
      module_id: moduleId,
      best_score: score as number,
      total,
      attempts: (existing?.attempts as number | undefined ?? 0) + 1,
      updated_at: now,
    },
    { onConflict: 'trainee_id,module_id' },
  )

  if (writeError) return internalError('Training progress write failed', writeError, 'Failed to save progress')

  return NextResponse.json({ ok: true, moduleId, score, total })
}
