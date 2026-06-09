import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'
import { internalError } from '@/lib/apiError'

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

  if (recipeRes.error) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
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
      const { error } = await db.from('recipe_ingredients')
        .update({ unit_cost: unit_cost ?? null })
        .eq('id', ingId).eq('recipe_id', id)
      if (error) return internalError('Recipe cost update failed', error, 'Failed to save costs')
    }
    return NextResponse.json({ ok: true })
  }

  // Full recipe save: { name, yield_qty, yield_unit, ingredients: [...] }
  if (body?.name !== undefined) {
    if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const { error: recipeError } = await db.from('recipes').update({
      name: body.name.trim(),
      yield_qty: body.yield_qty ?? 1,
      yield_unit: body.yield_unit ?? 'portion',
    }).eq('id', id)
    if (recipeError) return internalError('Recipe update failed', recipeError, 'Failed to save recipe')

    if (Array.isArray(body.ingredients)) {
      const incoming = body.ingredients as Array<Record<string, unknown>>
      const incomingIds = incoming
        .map(ing => typeof ing.id === 'number' ? ing.id : null)
        .filter((ingId): ingId is number => ingId != null)

      const { data: existingRows, error: existingError } = await db
        .from('recipe_ingredients')
        .select('id')
        .eq('recipe_id', id)
      if (existingError) return internalError('Recipe ingredient lookup failed', existingError, 'Failed to save recipe')

      const removedIds = (existingRows ?? [])
        .map(row => row.id as number)
        .filter(ingId => !incomingIds.includes(ingId))
      if (removedIds.length) {
        const { error: deleteError } = await db.from('recipe_ingredients').delete().in('id', removedIds).eq('recipe_id', id)
        if (deleteError) return internalError('Recipe ingredient delete failed', deleteError, 'Failed to save recipe')
      }

      for (const [i, ing] of incoming.entries()) {
        const values = {
          ingredient: ing.ingredient,
          qty_value: ing.qty_value ?? null,
          qty_unit: ing.qty_unit ?? null,
          notes: ing.notes ?? null,
          unit_cost: ing.unit_cost ?? null,
          sort_order: i,
        }

        if (typeof ing.id === 'number') {
          const { error: updateError } = await db.from('recipe_ingredients')
            .update(values)
            .eq('id', ing.id)
            .eq('recipe_id', id)
          if (updateError) return internalError('Recipe ingredient update failed', updateError, 'Failed to save recipe')
        } else {
          const { error: insertError } = await db.from('recipe_ingredients').insert({
            recipe_id: id,
            ...values,
          })
          if (insertError) return internalError('Recipe ingredient insert failed', insertError, 'Failed to save recipe')
        }
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
  if (error) return internalError('Recipe delete failed', error, 'Failed to delete recipe')
  return NextResponse.json({ ok: true })
}
