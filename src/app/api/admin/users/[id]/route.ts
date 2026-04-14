import { NextResponse } from 'next/server'
import { requireAdmin, adminClient, ADMIN_EMAIL } from '@/lib/adminAuth'

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
  if (target?.user?.email === ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Cannot delete the admin account' }, { status: 400 })
  }

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
