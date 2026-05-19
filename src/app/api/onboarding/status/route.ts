import { NextResponse } from 'next/server'
import { adminClient, getSessionUser } from '@/lib/adminAuth'
import { isOrganizationsEnabled } from '@/lib/tenant'

type IntegrationRow = {
  provider: string
  status: string
  last_synced_at: string | null
  last_error: string | null
}

export async function GET(req: Request) {
  if (!isOrganizationsEnabled()) {
    return NextResponse.json({ error: 'Organization onboarding is not enabled' }, { status: 404 })
  }

  const session = await getSessionUser(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const organizationId = session.tenant?.organizationId
  if (!organizationId) {
    return NextResponse.json({
      organization: null,
      integrations: [],
      nextStep: 'business_profile',
    })
  }

  const db = adminClient()
  const { data: integrations, error } = await db
    .from('integration_connections')
    .select('provider, status, last_synced_at, last_error')
    .eq('organization_id', organizationId)
    .order('provider', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (integrations ?? []) as IntegrationRow[]
  const byProvider = Object.fromEntries(rows.map((row) => [row.provider, row]))
  const onboarding = session.tenant?.onboarding

  let nextStep = 'launch'
  if (!onboarding?.businessProfileComplete) nextStep = 'business_profile'
  else if (byProvider.xero?.status !== 'connected') nextStep = 'xero'
  else if (!onboarding.posConfigured) nextStep = 'pos'
  else if (!onboarding.suppliersMapped) nextStep = 'suppliers'
  else if (!onboarding.historicalDataImported) nextStep = 'history'

  return NextResponse.json({
    organization: {
      id: organizationId,
      name: session.tenant?.organizationName,
      slug: session.tenant?.organizationSlug,
      role: session.tenant?.role,
      onboarding,
    },
    integrations: rows,
    nextStep,
  })
}
