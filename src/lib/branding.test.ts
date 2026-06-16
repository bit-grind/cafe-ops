import { describe, expect, it } from 'vitest'
import { DEFAULT_BRANDING, isDefaultBranding, normalizeBranding } from './branding'

describe('isDefaultBranding', () => {
  it('is true for the built-in fallback', () => {
    expect(isDefaultBranding(DEFAULT_BRANDING)).toBe(true)
    expect(isDefaultBranding(normalizeBranding(null))).toBe(true)
    expect(isDefaultBranding(normalizeBranding({}))).toBe(true)
  })

  it('is false once any field is real branding', () => {
    expect(
      isDefaultBranding(normalizeBranding({ displayName: 'The Blue Poppy' })),
    ).toBe(false)
    expect(
      isDefaultBranding({
        displayName: 'The Blue Poppy',
        subtitle: 'Ops Dashboard',
        logoSrc: '/api/branding/logo',
      }),
    ).toBe(false)
  })
})
