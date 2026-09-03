import { NextResponse } from 'next/server'
import { getSessionUser, adminClient, isAdminEmail } from '@/lib/adminAuth'
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * PATCH /api/training/trainees/[id] — revoke a link, issue a fresh one, or
 * correct a name.
 *
 * Reissuing replaces the stored hash, so the old link stops working the
 * moment the new one is minted.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageTraining(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

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

  const { action, fullName } = (body ?? {}) as { action?: unknown; fullName?: unknown }
  const now = new Date().toISOString()
  const db = adminClient()

  if (action === 'revoke' || action === 'restore') {
    const { error } = await db
      .from('training_trainee')
      .update({ status: action === 'revoke' ? 'revoked' : 'active', updated_at: now })
      .eq('id', id)
    if (error) return internalError('Training trainee status update failed', error, 'Failed to update trainee')
    return NextResponse.json({ ok: true, status: action === 'revoke' ? 'revoked' : 'active' })
  }

  if (action === 'reissue') {
    const token = generateTrainingToken()
    const { error } = await db
      .from('training_trainee')
      .update({
        token_hash: hashTrainingToken(token),
        token_hint: tokenHint(token),
        status: 'active',
        updated_at: now,
      })
      .eq('id', id)
    if (error) return internalError('Training trainee reissue failed', error, 'Failed to reissue link')

    const origin = process.env.APP_ORIGIN ?? new URL(req.url).origin
    return NextResponse.json({
      ok: true,
      tokenHint: tokenHint(token),
      inviteLink: buildInviteLink(origin, token),
    })
  }

  if (action === 'rename') {
    const name = typeof fullName === 'string' ? fullName.trim() : ''
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: 'Name too long' }, { status: 400 })
    }
    const { error } = await db
      .from('training_trainee')
      .update({ full_name: name, updated_at: now })
      .eq('id', id)
    if (error) return internalError('Training trainee rename failed', error, 'Failed to rename trainee')
    return NextResponse.json({ ok: true, name })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

/**
 * DELETE /api/training/trainees/[id] — admin only.
 *
 * A sign-off is an employment record, so ordinary managers revoke rather than
 * delete. Progress rows cascade.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const { error } = await adminClient().from('training_trainee').delete().eq('id', id)
  if (error) return internalError('Training trainee delete failed', error, 'Failed to delete trainee')

  return NextResponse.json({ ok: true })
}
