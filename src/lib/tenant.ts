import { createClient } from '@supabase/supabase-js'

export type OrganizationRole = 'owner' | 'admin' | 'kitchen' | 'guest'

export type RequestTenant = {
  organizationId: string | null
  organizationName: string | null
  organizationSlug: string | null
  role: OrganizationRole | null
  onboarding: {
    businessProfileComplete: boolean
    xeroConnected: boolean
    posConfigured: boolean
    suppliersMapped: boolean
    historicalDataImported: boolean
    launchedAt: string | null
  } | null
}

type MembershipRow = {
  organization_id: string
  role: OrganizationRole
  organizations: {
    name: string
    slug: string | null
  } | null
}

type OnboardingRow = {
  business_profile_complete: boolean
  xero_connected: boolean
  pos_configured: boolean
  suppliers_mapped: boolean
  historical_data_imported: boolean
  launched_at: string | null
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export function isOrganizationsEnabled() {
  return process.env.ENABLE_ORGANIZATIONS === 'true'
}

export async function getTenantForUser(userId: string): Promise<RequestTenant | null> {
  if (!isOrganizationsEnabled()) return null

  const supabase = getServiceClient()
  const { data: membership, error } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(name, slug)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<MembershipRow>()

  if (error) {
    if (error.code === '42P01' || /organization_members/i.test(error.message)) return null
    throw error
  }
  if (!membership) return null

  const { data: onboarding, error: onboardingError } = await supabase
    .from('organization_onboarding')
    .select('business_profile_complete, xero_connected, pos_configured, suppliers_mapped, historical_data_imported, launched_at')
    .eq('organization_id', membership.organization_id)
    .maybeSingle<OnboardingRow>()

  if (onboardingError && onboardingError.code !== '42P01') throw onboardingError

  return {
    organizationId: membership.organization_id,
    organizationName: membership.organizations?.name ?? null,
    organizationSlug: membership.organizations?.slug ?? null,
    role: membership.role,
    onboarding: onboarding
      ? {
          businessProfileComplete: onboarding.business_profile_complete,
          xeroConnected: onboarding.xero_connected,
          posConfigured: onboarding.pos_configured,
          suppliersMapped: onboarding.suppliers_mapped,
          historicalDataImported: onboarding.historical_data_imported,
          launchedAt: onboarding.launched_at,
        }
      : null,
  }
}

export function roleFromTenantOrMetadata(
  tenantRole: OrganizationRole | null | undefined,
  metadataRole: string | null | undefined,
  isGlobalAdmin: boolean
): string | null {
  if (tenantRole === 'owner') return 'admin'
  if (tenantRole) return tenantRole
  if (metadataRole) return metadataRole
  return isGlobalAdmin ? 'admin' : null
}
