import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const db = adminClient()

  const [recipeRes, ingredientsRes] = await Promise.all([
    db.from('recipes').select('id, name, yield_qty, yield_unit').eq('id', id).single(),
    db.from('recipe_ingredients')
      .select('id, ingredient, qty_value, qty_unit, notes, unit_cost, sort_order')
      .eq('recipe_id', id)
      .order('sort_order'),
  ])

  if (recipeRes.error) return NextResponse.json({ error: recipeRes.error.message }, { status: 404 })
  return NextResponse.json({ recipe: recipeRes.data, ingredients: ingredientsRes.data ?? [] })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json() as { costs: Array<{ id: number; unit_cost: number | null }> }

  if (!Array.isArray(body?.costs)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const db = adminClient()
  for (const { id: ingId, unit_cost } of body.costs) {
    await db
      .from('recipe_ingredients')
      .update({ unit_cost: unit_cost ?? null })
      .eq('id', ingId)
      .eq('recipe_id', id)
  }

  return NextResponse.json({ ok: true })
}
