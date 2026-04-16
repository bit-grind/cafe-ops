import { NextResponse } from 'next/server'
import { requireAdmin, adminClient, isAdminEmail } from '@/lib/adminAuth'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = adminClient()

  const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(id)
  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: userErr?.message ?? 'Not found' }, { status: 404 })
  }
  const u = userRes.user

  const { data: queries, error: qErr } = await supabase
    .from('ask_queries')
    .select('id, question, answer, created_at')
    .eq('user_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  return NextResponse.json({
    user: {
      id: u.id,
      email: u.email ?? null,
      role: ((u.user_metadata as Record<string, unknown> | null)?.role as string) ?? 'admin',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
    },
    queries: queries ?? [],
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const body = (await req.json().catch(() => ({}))) as {
    role?: string
  }
  const newRole = ['guest', 'kitchen'].includes(body.role || '') ? body.role : 'admin'

  const supabase = adminClient()

  // Get the user first to check if it's the admin account
  const { data: target } = await supabase.auth.admin.getUserById(id)
  if (!target?.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  if (isAdminEmail(target.user.email)) {
    return NextResponse.json({ error: 'Cannot change the admin account role' }, { status: 400 })
  }

  // Update the user's role in metadata
  const { data, error } = await supabase.auth.admin.updateUserById(id, {
    user_metadata: { role: newRole },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
      role: ((data.user.user_metadata as Record<string, unknown> | null)?.role as string) ?? 'admin',
      created_at: data.user.created_at,
      last_sign_in_at: data.user.last_sign_in_at ?? null,
      email_confirmed_at: data.user.email_confirmed_at ?? null,
    },
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = adminClient()

  // Refuse to delete the admin account itself.
  const { data: target } = await supabase.auth.admin.getUserById(id)
  if (isAdminEmail(target?.user?.email)) {
    return NextResponse.json({ error: 'Cannot delete the admin account' }, { status: 400 })
  }

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
