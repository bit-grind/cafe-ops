export type Branding = {
  displayName: string
  subtitle: string
  logoSrc: string
}

export const DEFAULT_BRANDING: Branding = {
  displayName: 'Cafe Ops',
  subtitle: 'Ops Dashboard',
  logoSrc: '/brand/logo.svg',
}

export function normalizeBranding(input: Partial<Branding> | null | undefined): Branding {
  return {
    displayName: input?.displayName?.trim() || DEFAULT_BRANDING.displayName,
    subtitle: input?.subtitle?.trim() || DEFAULT_BRANDING.subtitle,
    logoSrc: input?.logoSrc?.trim() || DEFAULT_BRANDING.logoSrc,
  }
}

// True when branding is the built-in fallback (storage read failed / not
// configured). Callers use this to avoid publicly caching a fallback response:
// a transient failure must not get pinned at the CDN and served as the brand.
export function isDefaultBranding(branding: Branding): boolean {
  return (
    branding.displayName === DEFAULT_BRANDING.displayName &&
    branding.subtitle === DEFAULT_BRANDING.subtitle &&
    branding.logoSrc === DEFAULT_BRANDING.logoSrc
  )
}
