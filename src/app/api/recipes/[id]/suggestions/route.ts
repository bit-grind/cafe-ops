import { NextResponse } from 'next/server'
import { getSessionUser, adminClient } from '@/lib/adminAuth'

const STOP_WORDS = new Set([
  'and', 'or', 'the', 'a', 'an', 'with', 'fresh', 'frozen', 'finely',
  'chopped', 'diced', 'sliced', 'whole', 'dried', 'ground', 'packed',
  'softened', 'melted', 'room', 'temperature', 'large', 'small', 'medium',
  'plain', 'free', 'full', 'cream', 'for', 'per', 'raw', 'mixed',
])

function keywords(name: string): string[] {
  return [...new Set(
    name.toLowerCase()
      .replace(/[&'']/g, '')
      .replace(/\d+/g, '')
      .split(/[\s\-\/]+/)
      .map(w => w.trim())
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  )].sort((a, b) => b.length - a.length).slice(0, 2)
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const db = adminClient()

  const { data: ingredients } = await db
    .from('recipe_ingredients')
    .select('id, ingredient')
    .eq('recipe_id', id)

  if (!ingredients?.length) return NextResponse.json({ suggestions: {} })

  const suggestions: Record<number, object[]> = {}

  await Promise.all(
    ingredients.map(async ing => {
      const kws = keywords(ing.ingredient)
      if (!kws.length) { suggestions[ing.id] = []; return }

      const { data: rows } = await db
        .from('extracted_line_items')
        .select('id, description, unit_price, unit, xero_invoice_id, created_at, xero_bill_cache!inner(contact_name, invoice_date)')
        .gt('unit_price', 0)
        .ilike('description', `%${kws[0]}%`)
        .order('created_at', { ascending: false })
        .limit(20)

      if (!rows?.length) { suggestions[ing.id] = []; return }

      // Apply secondary keyword filter in JS
      const filtered = kws[1]
        ? rows.filter(r => r.description.toLowerCase().includes(kws[1]))
        : rows

      const pool = (filtered.length ? filtered : rows)

      // De-duplicate by description+unit_price, keep most recent
      const seen = new Set<string>()
      const deduped = pool.filter(r => {
        const key = `${r.description.toLowerCase()}|${r.unit_price}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }).slice(0, 5)

      suggestions[ing.id] = deduped.map(r => {
        const cache = Array.isArray(r.xero_bill_cache) ? r.xero_bill_cache[0] : r.xero_bill_cache
        return {
          id: r.id,
          description: r.description,
          unit_price: Number(r.unit_price),
          unit: r.unit,
          supplier: (cache as { contact_name?: string })?.contact_name ?? null,
          invoice_date: (cache as { invoice_date?: string })?.invoice_date ?? null,
        }
      })
    })
  )

  return NextResponse.json({ suggestions })
}
