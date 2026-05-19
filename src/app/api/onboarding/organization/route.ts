import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'
import { isOrganizationsEnabled } from '@/lib/tenant'

type CreateOrganizationBody = {
  name?: string
  timezone?: string
  currencyCode?: string
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function organizationSlug(name: string) {
  const base = slugify(name)
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${base || 'business'}-${suffix}`
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function POST(req: Request) {
  if (!isOrganizationsEnabled()) {
    return NextResponse.json({ error: 'Organization onboarding is not enabled' }, { status: 404 })
  }

  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as CreateOrganizationBody
  const name = (body.name ?? '').trim()
  const timezone = (body.timezone ?? 'Australia/Brisbane').trim() || 'Australia/Brisbane'
  const currencyCode = (body.currencyCode ?? 'AUD').trim().toUpperCase() || 'AUD'

  if (name.length < 2) {
    return NextResponse.json({ error: 'Business name is required' }, { status: 400 })
  }

  const db = adminClient()

  const { data: existing, error: existingError } = await db
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }
  if (existing) {
    const { data: existingOrganization, error: existingOrganizationError } = await db
      .from('organizations')
      .select('name, slug')
      .eq('id', existing.organization_id)
      .maybeSingle()

    if (existingOrganizationError) {
      return NextResponse.json({ error: existingOrganizationError.message }, { status: 500 })
    }

    return NextResponse.json({
      organization: {
        id: existing.organization_id,
        name: existingOrganization?.name ?? null,
        slug: existingOrganization?.slug ?? null,
        role: existing.role,
      },
      alreadyExists: true,
    })
  }

  const { data: organization, error: organizationError } = await db
    .from('organizations')
    .insert({
      name,
      slug: organizationSlug(name),
      timezone,
      currency_code: currencyCode,
    })
    .select('id, name, slug')
    .single()

  if (organizationError) {
    return NextResponse.json({ error: organizationError.message }, { status: 500 })
  }

  const { error: memberError } = await db.from('organization_members').insert({
    organization_id: organization.id,
    user_id: user.id,
    role: 'owner',
  })

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  const { error: onboardingError } = await db.from('organization_onboarding').insert({
    organization_id: organization.id,
    business_profile_complete: true,
  })

  if (onboardingError) {
    return NextResponse.json({ error: onboardingError.message }, { status: 500 })
  }

  return NextResponse.json({
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: 'owner',
    },
    alreadyExists: false,
  })
}
