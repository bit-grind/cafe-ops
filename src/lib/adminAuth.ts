import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export type AppRole = 'staff' | 'kitchen' | 'guest' | 'team'

const APP_ROLES = new Set<AppRole>(['staff', 'kitchen', 'guest', 'team'])

export function normalizeAppRole(role: unknown): AppRole {
  if (role === 'admin') return 'staff'
  return APP_ROLES.has(role as AppRole) ? role as AppRole : 'guest'
}

/**
 * Admin email lives in the ADMIN_EMAIL env var, never in source. Set it in
 * .env.local for local dev and in the Vercel project env for production.
 *
 * The helpers below only ever run server-side, so it's safe to compare
 * against process.env directly — nothing here is bundled to the browser.
 */
export function isAdminEmail(email?: string | null): boolean {
  const admin = process.env.ADMIN_EMAIL
  return !!admin && !!email && email === admin
}

export function isTeamEmail(email?: string | null): boolean {
  const team = process.env.TEAM_LOGIN_EMAIL
  return !!team && !!email && email === team
}

function effectiveAppRole(role: unknown, email?: string | null): AppRole {
  const normalized = normalizeAppRole(role)
  return normalized === 'guest' && isTeamEmail(email) ? 'team' : normalized
}

/**
 * Verify the caller is authenticated AND is the admin. Returns either
 * { ok: true, email } or { ok: false, response } where `response` is a
 * NextResponse the handler should return immediately.
 */
export async function requireAdmin(
  req: Request
): Promise<{ ok: true; email: string } | { ok: false; response: NextResponse }> {
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  )
  const {
    data: { user },
  } = await anonClient.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!isAdminEmail(user.email)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, email: user.email! }
}

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Resolve the caller's identity and permission flags from the incoming
 * Authorization header. Returns null when the session is missing or
 * invalid. Route handlers that need more than an authenticated user
 * (e.g. "deny guests") should check the flags on the returned object.
 */
export async function getSessionUser(req: Request): Promise<
  | null
  | {
      id: string
      email: string | null
      role: AppRole
      isAdmin: boolean
      isGuest: boolean
      isKitchen: boolean
      isTeam: boolean
    }
> {
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return null
  const email = user.email ?? null
  const isAdmin = isAdminEmail(email)

  // user_metadata is user-writable and must never participate in authorization.
  // Unknown users and lookup failures intentionally receive least privilege.
  let role: AppRole = 'guest'
  const { data: roleRow, error: roleError } = await adminClient()
    .from('user_role')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (roleError) console.error('user_role lookup failed:', roleError.message)
  if (roleRow?.role) role = effectiveAppRole(roleRow.role, email)

  return {
    id: user.id,
    email,
    role,
    isAdmin,
    // Team users inherit the restricted-user checks everywhere except the
    // calendar route, which explicitly permits them.
    isGuest: !isAdmin && (role === 'guest' || role === 'team'),
    isKitchen: role === 'kitchen',
    isTeam: !isAdmin && role === 'team',
  }
}

/**
 * Upsert a user's role into the server-controlled `user_role` table. Call this
 * from admin user-management routes so the table stays the source of truth.
 */
export async function setUserRole(userId: string, email: string | null, role: AppRole): Promise<void> {
  const storedRole = role === 'team' ? 'guest' : role
  const { error } = await adminClient()
    .from('user_role')
    .upsert(
      { user_id: userId, email, role: storedRole, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  if (error) throw new Error(`user_role upsert failed: ${error.message}`)
}

/** Remove a user's role row (e.g. when the account is deleted). */
export async function deleteUserRole(userId: string): Promise<void> {
  const { error } = await adminClient().from('user_role').delete().eq('user_id', userId)
  if (error) throw new Error(`user_role delete failed: ${error.message}`)
}

/** Fetch a map of user_id → role for the given user IDs (admin listings). */
export async function getUserRoles(userIds: string[]): Promise<Record<string, AppRole>> {
  if (userIds.length === 0) return {}
  const { data, error } = await adminClient().from('user_role').select('user_id, email, role').in('user_id', userIds)
  if (error) throw new Error(`user_role list failed: ${error.message}`)
  const map: Record<string, AppRole> = {}
  for (const row of data ?? []) map[row.user_id as string] = effectiveAppRole(row.role, row.email as string | null)
  return map
}
