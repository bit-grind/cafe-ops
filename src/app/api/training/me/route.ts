import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { internalError } from '@/lib/apiError'
import { resolveTrainee, touchTrainee } from '@/lib/training/traineeAuth'

/**
 * GET /api/training/me — the trainee's own record and progress.
 *
 * Token-authenticated (see traineeAuth); no ops session involved. This is the
 * call that makes progress survive a cleared browser or a new phone: the
 * server, not localStorage, is the record.
 */
export async function GET(req: Request) {
  const trainee = await resolveTrainee(req)
  if (!trainee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await adminClient()
    .from('training_module_progress')
    .select('module_id, best_score, total, attempts, first_completed_at')
    .eq('trainee_id', trainee.id)

  if (error) return internalError('Training progress read failed', error, 'Failed to load progress')

  // Fire-and-forget: a failed timestamp update must not block the trainee.
  void touchTrainee(trainee.id, trainee.started_at === null)

  return NextResponse.json({
    name: trainee.full_name,
    signedOffAt: trainee.signed_off_at,
    signedOffName: trainee.signed_off_name,
    completed: (data ?? []).map(row => ({
      moduleId: row.module_id as string,
      bestScore: row.best_score as number,
      total: row.total as number,
      attempts: row.attempts as number,
      completedAt: row.first_completed_at as string,
    })),
  })
}
