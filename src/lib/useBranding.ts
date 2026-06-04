'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_BRANDING, normalizeBranding, type Branding } from '@/lib/branding'

declare global {
  interface Window {
    __APP_BRANDING__?: Partial<Branding>
  }
}

let cachedBranding: Branding | null = null
let brandingRequest: Promise<Branding> | null = null

function getInitialBranding() {
  if (cachedBranding) return cachedBranding
  if (typeof window === 'undefined') return DEFAULT_BRANDING

  cachedBranding = normalizeBranding(window.__APP_BRANDING__)
  return cachedBranding
}

async function fetchBranding(): Promise<Branding> {
  const response = await fetch('/api/branding', { cache: 'no-store' })
  if (!response.ok) return DEFAULT_BRANDING
  return normalizeBranding(await response.json())
}

export function useBranding() {
  const [branding, setBranding] = useState<Branding>(getInitialBranding)

  useEffect(() => {
    let alive = true
    brandingRequest ??= fetchBranding()
      .then((next) => {
        cachedBranding = next
        return next
      })
      .catch(() => DEFAULT_BRANDING)

    brandingRequest.then((next) => {
      if (alive) setBranding(next)
    })

    return () => {
      alive = false
    }
  }, [])

  return branding
}
