import { NextResponse } from 'next/server'
import { requireAdmin, adminClient } from '@/lib/adminAuth'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const supabase = adminClient()
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email ?? null,
    role: ((u.user_metadata as Record<string, unknown> | null)?.role as string) ?? 'admin',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
  }))

  return NextResponse.json({ users })
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    email?: string
    password?: string
    role?: string
  }
  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  const role = ['guest', 'kitchen'].includes(body.role || '') ? body.role : 'admin'

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 })
  }
  if (password.length < 12) {
    return NextResponse.json({ error: 'password must be at least 12 characters' }, { status: 400 })
  }

  const supabase = adminClient()
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
      role,
      created_at: data.user.created_at,
    },
  })
}
