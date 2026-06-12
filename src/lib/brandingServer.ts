import 'server-only'

import { cache } from 'react'
import { adminClient } from '@/lib/adminAuth'
import { DEFAULT_BRANDING, normalizeBranding, type Branding } from '@/lib/branding'

const BRANDING_BUCKET = process.env.BRANDING_STORAGE_BUCKET || 'app-runtime-assets'
const BRANDING_CONFIG_PATH = process.env.BRANDING_CONFIG_PATH || 'branding/config.json'
const BRANDING_LOGO_PATH = process.env.BRANDING_LOGO_PATH || 'branding/logo.webp'

export function getBrandingLogoPath() {
  return BRANDING_LOGO_PATH
}

export function getBrandingBucket() {
  return BRANDING_BUCKET
}

function getEnvBranding(): Branding | null {
  const displayName = process.env.APP_DISPLAY_NAME || process.env.NEXT_PUBLIC_APP_DISPLAY_NAME
  const subtitle = process.env.APP_SUBTITLE || process.env.NEXT_PUBLIC_APP_SUBTITLE
  const logoSrc = process.env.APP_LOGO_SRC || process.env.NEXT_PUBLIC_APP_LOGO_SRC

  if (!displayName && !subtitle && !logoSrc) return null
  return normalizeBranding({ displayName, subtitle, logoSrc })
}

// Branding changes rarely, so warm instances reuse the last storage read for a
// few minutes (matching the logo route's max-age) instead of re-downloading on
// every page render. Failures are cached briefly so an outage can't hammer
// storage but still recovers quickly.
const BRANDING_CACHE_OK_MS = 5 * 60 * 1000
const BRANDING_CACHE_FAIL_MS = 30 * 1000
let brandingCache: { value: Branding; expiresAt: number } | null = null

export const getServerBranding = cache(async function getServerBranding(): Promise<Branding> {
  const envBranding = getEnvBranding()
  if (envBranding) return envBranding

  if (brandingCache && Date.now() < brandingCache.expiresAt) return brandingCache.value

  let branding = DEFAULT_BRANDING
  let ttl = BRANDING_CACHE_FAIL_MS
  try {
    const { data, error } = await adminClient()
      .storage
      .from(BRANDING_BUCKET)
      .download(BRANDING_CONFIG_PATH)

    if (!error && data) {
      const config = JSON.parse(await data.text()) as Partial<Branding>
      branding = normalizeBranding({
        ...config,
        logoSrc: config.logoSrc || '/api/branding/logo',
      })
      ttl = BRANDING_CACHE_OK_MS
    }
  } catch {
    // fall through: default branding with the short failure TTL
  }
  brandingCache = { value: branding, expiresAt: Date.now() + ttl }
  return branding
})
