import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'
import { internalError } from '@/lib/apiError'
import { canManageTraining } from '@/lib/permissions'
import {
  buildInviteLink,
  generateTrainingToken,
  hashTrainingToken,
  tokenHint,
} from '@/lib/training/traineeAuth'

const MAX_BODY_BYTES = 2_000
const MAX_NAME_LENGTH = 120

type ProgressRow = {
  trainee_id: string
  module_id: string
  best_score: number
  total: number
  first_completed_at: string
}

/** GET /api/training/trainees — the onboarding roster with per-module progress. */
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageTraining(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = adminClient()

  const { data: trainees, error: traineeError } = await db
    .from('training_trainee')
    // token_hash is deliberately not selected — nothing downstream needs it.
    .select('id, full_name, token_hint, status, created_at, started_at, last_seen_at, signed_off_at, signed_off_name, content_version')
    .order('created_at', { ascending: false })

  if (traineeError) return internalError('Training roster read failed', traineeError, 'Failed to load trainees')

  const { data: progress, error: progressError } = await db
    .from('training_module_progress')
    .select('trainee_id, module_id, best_score, total, first_completed_at')

  if (progressError) return internalError('Training progress read failed', progressError, 'Failed to load trainees')

  const byTrainee = new Map<string, ProgressRow[]>()
  for (const row of (progress ?? []) as ProgressRow[]) {
    const list = byTrainee.get(row.trainee_id) ?? []
    list.push(row)
    byTrainee.set(row.trainee_id, list)
  }

  return NextResponse.json({
    trainees: (trainees ?? []).map(t => ({
      id: t.id,
      name: t.full_name,
      tokenHint: t.token_hint,
      status: t.status,
      createdAt: t.created_at,
      startedAt: t.started_at,
      lastSeenAt: t.last_seen_at,
      signedOffAt: t.signed_off_at,
      signedOffName: t.signed_off_name,
      contentVersion: t.content_version,
      completed: (byTrainee.get(t.id as string) ?? []).map(p => ({
        moduleId: p.module_id,
        bestScore: p.best_score,
        total: p.total,
        completedAt: p.first_completed_at,
      })),
    })),
  })
}

/**
 * POST /api/training/trainees — add a new starter and mint their invite link.
 *
 * The raw token is returned exactly once, here. Only its hash is stored, so
 * it can never be recovered later — a lost link is reissued, not looked up.
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageTraining(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

  const token = generateTrainingToken()

  const { data, error } = await adminClient()
    .from('training_trainee')
    .insert({
      full_name: fullName,
      token_hash: hashTrainingToken(token),
      token_hint: tokenHint(token),
      created_by_email: user.email,
    })
    .select('id, full_name, token_hint, status, created_at')
    .single()

  if (error) return internalError('Training trainee create failed', error, 'Failed to add trainee')

  const origin = process.env.APP_ORIGIN ?? new URL(req.url).origin

  return NextResponse.json({
    trainee: {
      id: data.id,
      name: data.full_name,
      tokenHint: data.token_hint,
      status: data.status,
      createdAt: data.created_at,
      completed: [],
    },
    // Shown once. Not recoverable afterwards.
    inviteLink: buildInviteLink(origin, token),
  })
}
