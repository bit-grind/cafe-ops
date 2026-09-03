import { createHash, randomBytes } from 'crypto'
import { adminClient } from '@/lib/adminAuth'

/**
 * Trainees are new hires with no ops account. They authenticate with a
 * per-person invite token instead of a session.
 *
 * The token travels in the URL *fragment* (`/training#<token>`), which
 * browsers never send to the server, so it stays out of request logs — the
 * same reasoning behind the "secrets in headers, never query strings" rule in
 * AGENTS.md. From there the page sends it as an `x-training-token` header.
 *
 * Only the SHA-256 of the token is stored, so a database read never yields a
 * working link.
 */

export const TRAINING_TOKEN_HEADER = 'x-training-token'

/** 32 random bytes, base64url-encoded — 43 characters, no padding. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function generateTrainingToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashTrainingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token)
}

/** Last 4 characters, stored so the roster can tell two links apart. */
export function tokenHint(token: string): string {
  return token.slice(-4)
}

export type Trainee = {
  id: string
  full_name: string
  status: string
  started_at: string | null
  signed_off_at: string | null
  signed_off_name: string | null
}

/**
 * Resolve the trainee behind a request, or null when the token is missing,
 * malformed, unknown or revoked. Callers return 401 on null — deliberately
 * without distinguishing the cases, so this can't be used as an oracle.
 */
export async function resolveTrainee(req: Request): Promise<Trainee | null> {
  const token = req.headers.get(TRAINING_TOKEN_HEADER)
  // Shape-check before touching the database: anything that isn't a
  // well-formed token can't match a stored hash anyway.
  if (!token || !isWellFormedToken(token)) return null

  const { data, error } = await adminClient()
    .from('training_trainee')
    .select('id, full_name, status, started_at, signed_off_at, signed_off_name')
    .eq('token_hash', hashTrainingToken(token))
    .maybeSingle()

  if (error) {
    console.error('training_trainee lookup failed:', error.message)
    return null
  }
  if (!data || data.status !== 'active') return null
  return data as Trainee
}

/**
 * Record that the trainee is using the course. `started_at` is set once, on
 * first contact; `last_seen_at` moves every time.
 */
export async function touchTrainee(traineeId: string, isFirstContact: boolean): Promise<void> {
  const now = new Date().toISOString()
  const patch: Record<string, string> = { last_seen_at: now, updated_at: now }
  if (isFirstContact) patch.started_at = now
  const { error } = await adminClient()
    .from('training_trainee')
    .update(patch)
    .eq('id', traineeId)
  if (error) console.error('training_trainee touch failed:', error.message)
}

/** Build the invite link handed to a new starter. */
export function buildInviteLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/training#${token}`
}
