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
  const db = adminClient()
  const body = await req.json()

  // Cost-only save: { costs: [...] }
  if (Array.isArray(body?.costs)) {
    for (const { id: ingId, unit_cost } of body.costs as Array<{ id: number; unit_cost: number | null }>) {
      await db.from('recipe_ingredients')
        .update({ unit_cost: unit_cost ?? null })
        .eq('id', ingId).eq('recipe_id', id)
    }
    return NextResponse.json({ ok: true })
  }

  // Full recipe save: { name, yield_qty, yield_unit, ingredients: [...] }
  if (body?.name !== undefined) {
    if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    await db.from('recipes').update({
      name: body.name.trim(),
      yield_qty: body.yield_qty ?? 1,
      yield_unit: body.yield_unit ?? 'portion',
    }).eq('id', id)

    if (Array.isArray(body.ingredients)) {
      // Delete all existing ingredients and re-insert to handle reorder/delete/add cleanly
      await db.from('recipe_ingredients').delete().eq('recipe_id', id)
      if (body.ingredients.length) {
        await db.from('recipe_ingredients').insert(
          body.ingredients.map((ing: Record<string, unknown>, i: number) => ({
            recipe_id: id,
            ingredient: ing.ingredient,
            qty_value: ing.qty_value ?? null,
            qty_unit: ing.qty_unit ?? null,
            notes: ing.notes ?? null,
            unit_cost: ing.unit_cost ?? null,
            sort_order: i,
          }))
        )
      }
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { error } = await adminClient().from('recipes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
