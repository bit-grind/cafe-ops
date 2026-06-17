'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_BRANDING, normalizeBranding, type Branding } from '@/lib/branding'

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING)

async function fetchBranding(): Promise<Branding> {
  // no-store: never let the browser keep a stale (possibly default) copy — this
  // re-fetch is what corrects a server render that fell back to default. The
  // payload is tiny and the server response is itself CDN-cached when real.
  const response = await fetch('/api/branding', { cache: 'no-store' })
  if (!response.ok) return DEFAULT_BRANDING
  return normalizeBranding(await response.json())
}

export function BrandingProvider({
  initialBranding,
  children,
}: {
  initialBranding: Partial<Branding>
  children: ReactNode
}) {
  const initial = useMemo(() => normalizeBranding(initialBranding), [initialBranding])
  const [branding, setBranding] = useState<Branding>(initial)

  useEffect(() => {
    let alive = true

    fetchBranding()
      .then((next) => {
        if (alive) setBranding(next)
      })
      .catch(() => {
        if (alive) setBranding(initial)
      })

    return () => {
      alive = false
    }
  }, [initial])

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  return useContext(BrandingContext)
}
