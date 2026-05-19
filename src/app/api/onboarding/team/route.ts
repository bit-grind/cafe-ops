import { NextResponse } from 'next/server'
import { adminClient, getSessionUser } from '@/lib/adminAuth'
import { isOrganizationsEnabled, type OrganizationRole } from '@/lib/tenant'

type TeamMember = {
  userId: string
  email: string | null
  role: OrganizationRole
  createdAt: string
}

type TeamInviteBody = {
  email?: string
  password?: string
  role?: OrganizationRole
}

const assignableRoles = new Set<OrganizationRole>(['admin', 'kitchen', 'guest'])

function canManageTeam(role: OrganizationRole | null | undefined) {
  return role === 'owner' || role === 'admin'
}

function temporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!$%'
  let out = ''
  for (let i = 0; i < 18; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

async function getUserEmailMap(userIds: string[]) {
  const db = adminClient()
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(error.message)
  return new Map(
    data.users
      .filter((user) => userIds.includes(user.id))
      .map((user) => [user.id, user.email ?? null])
  )
}

export async function GET(req: Request) {
  if (!isOrganizationsEnabled()) {
    return NextResponse.json({ error: 'Team onboarding is not enabled' }, { status: 404 })
  }

  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const organizationId = session.tenant?.organizationId
  if (!organizationId) {
    return NextResponse.json({ error: 'Organization setup is required' }, { status: 400 })
  }
  if (!canManageTeam(session.tenant?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = adminClient()
  const { data, error } = await db
    .from('organization_members')
    .select('user_id, role, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const emailByUserId = await getUserEmailMap((data ?? []).map((row) => row.user_id))
  const members: TeamMember[] = (data ?? []).map((row) => ({
    userId: row.user_id,
    email: emailByUserId.get(row.user_id) ?? null,
    role: row.role,
    createdAt: row.created_at,
  }))

  return NextResponse.json({ members })
}

export async function POST(req: Request) {
  if (!isOrganizationsEnabled()) {
    return NextResponse.json({ error: 'Team onboarding is not enabled' }, { status: 404 })
  }

  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const organizationId = session.tenant?.organizationId
  if (!organizationId) {
    return NextResponse.json({ error: 'Organization setup is required' }, { status: 400 })
  }
  if (!canManageTeam(session.tenant?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as TeamInviteBody
  const email = (body.email ?? '').trim().toLowerCase()
  const role = assignableRoles.has(body.role as OrganizationRole) ? (body.role as OrganizationRole) : 'guest'
  const password = body.password?.trim() || temporaryPassword()

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }
  if (password.length < 12) {
    return NextResponse.json({ error: 'Password must be at least 12 characters' }, { status: 400 })
  }

  const db = adminClient()
  const { data: users, error: listError } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

  const existingUser = users.users.find((user) => user.email?.toLowerCase() === email)
  let userId = existingUser?.id
  let createdUser = false

  if (!userId) {
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    })
    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 })
    userId = created.user.id
    createdUser = true
  }

  const { error: memberError } = await db
    .from('organization_members')
    .upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,user_id' }
    )

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })

  return NextResponse.json({
    member: {
      userId,
      email,
      role,
      createdUser,
      temporaryPassword: createdUser ? password : null,
    },
  })
}
