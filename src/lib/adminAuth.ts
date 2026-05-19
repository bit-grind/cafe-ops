import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getTenantForUser, roleFromTenantOrMetadata, type RequestTenant } from './tenant'

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
      email: string | null
      userId: string
      role: string | null
      tenant: RequestTenant | null
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
  const metadataRole = (user.user_metadata?.role as string) ?? null
  const tenant = await getTenantForUser(user.id)
  const globalAdmin = isAdminEmail(email)
  const role = roleFromTenantOrMetadata(tenant?.role, metadataRole, globalAdmin)
  return {
    email,
    userId: user.id,
    role,
    tenant,
    isAdmin: role === 'admin',
    isGuest: role === 'guest' || email === 'guest@thebluepoppy.co',
    isKitchen: role === 'kitchen',
  }
}
