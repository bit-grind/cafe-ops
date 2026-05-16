import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKitchenSuppliers } from '@/lib/suppliers-db'

/**
 * GET /api/suppliers
 *
 * The admin-managed kitchen supplier list. Open to any authenticated
 * user — the Suppliers page is available to admin, guest, and kitchen
 * roles, and all of them need the list to render supplier chips.
 */
export async function GET(req: Request) {
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const suppliers = await getKitchenSuppliers()
  return NextResponse.json({ suppliers })
}
