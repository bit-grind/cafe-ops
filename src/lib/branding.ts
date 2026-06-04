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
