import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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
      role: string | null
      isAdmin: boolean
      isGuest: boolean
      isKitchen: boolean
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

  // Resolve role from the server-controlled `user_role` table first. user_metadata
  // is writable by the user themselves, so trusting it for role lets a guest
  // self-escalate. We fall back to metadata only when there's no row yet (e.g. a
  // user created before the table existed), which preserves old behaviour without
  // ever weakening it.
  let role = (user.user_metadata?.role as string) ?? null
  try {
    const { data: roleRow } = await adminClient()
      .from('user_role')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    if (roleRow?.role) role = roleRow.role
  } catch {
    /* fall back to metadata role */
  }

  return {
    id: user.id,
    email,
    role,
    isAdmin: isAdminEmail(email),
    isGuest: role === 'guest' || email === 'guest@thebluepoppy.co',
    isKitchen: role === 'kitchen',
  }
}

/**
 * Upsert a user's role into the server-controlled `user_role` table. Call this
 * from admin user-management routes so the table stays the source of truth.
 */
export async function setUserRole(userId: string, email: string | null, role: string): Promise<void> {
  const { error } = await adminClient()
    .from('user_role')
    .upsert(
      { user_id: userId, email, role, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  if (error) console.error('user_role upsert failed:', error.message)
}

/** Remove a user's role row (e.g. when the account is deleted). */
export async function deleteUserRole(userId: string): Promise<void> {
  const { error } = await adminClient().from('user_role').delete().eq('user_id', userId)
  if (error) console.error('user_role delete failed:', error.message)
}

/** Fetch a map of user_id → role for the given user IDs (admin listings). */
export async function getUserRoles(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {}
  const { data } = await adminClient().from('user_role').select('user_id, role').in('user_id', userIds)
  const map: Record<string, string> = {}
  for (const row of data ?? []) map[row.user_id as string] = row.role as string
  return map
}
