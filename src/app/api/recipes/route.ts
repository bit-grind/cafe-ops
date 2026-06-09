import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'
import { internalError } from '@/lib/apiError'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await adminClient()
    .from('recipes')
    .select('id, name, yield_qty, yield_unit')
    .order('name')

  if (error) return internalError('Recipe list failed', error, 'Failed to load recipes')
  return NextResponse.json({ recipes: data })
}

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, yield_qty, yield_unit, ingredients } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const db = adminClient()
  const { data: recipe, error } = await db
    .from('recipes')
    .insert({ name: name.trim(), yield_qty: yield_qty ?? 1, yield_unit: yield_unit ?? 'portion' })
    .select('id, name, yield_qty, yield_unit')
    .single()

  if (error) return internalError('Recipe create failed', error, 'Failed to save recipe')

  if (Array.isArray(ingredients) && ingredients.length) {
    const { error: ingredientError } = await db.from('recipe_ingredients').insert(
      ingredients.map((ing: Record<string, unknown>, i: number) => ({
        recipe_id: recipe.id,
        ingredient: ing.ingredient,
        qty_value: ing.qty_value ?? null,
        qty_unit: ing.qty_unit ?? null,
        notes: ing.notes ?? null,
        unit_cost: ing.unit_cost ?? null,
        sort_order: i,
      }))
    )
    if (ingredientError) return internalError('Recipe ingredient insert failed', ingredientError, 'Failed to save recipe')
  }

  return NextResponse.json({ recipe })
}
