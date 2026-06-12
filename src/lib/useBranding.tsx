'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_BRANDING, normalizeBranding, type Branding } from '@/lib/branding'

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING)

async function fetchBranding(): Promise<Branding> {
  const response = await fetch('/api/branding')
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
