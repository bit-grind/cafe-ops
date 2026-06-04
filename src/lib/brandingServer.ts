import 'server-only'

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

export async function getServerBranding(): Promise<Branding> {
  const envBranding = getEnvBranding()
  if (envBranding) return envBranding

  try {
    const { data, error } = await adminClient()
      .storage
      .from(BRANDING_BUCKET)
      .download(BRANDING_CONFIG_PATH)

    if (error || !data) return DEFAULT_BRANDING

    const config = JSON.parse(await data.text()) as Partial<Branding>
    return normalizeBranding({
      ...config,
      logoSrc: config.logoSrc || '/api/branding/logo',
    })
  } catch {
    return DEFAULT_BRANDING
  }
}
