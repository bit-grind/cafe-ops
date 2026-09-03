import { describe, it, expect } from 'vitest'
import { getAllowedTabs, getLandingHref, canManageTraining } from '@/lib/permissions'

describe('getAllowedTabs', () => {
  it('kitchen sees its limited dashboard, full team calendar, suppliers and recipes', () => {
    expect(getAllowedTabs({ isAdmin: false, isGuest: false, isKitchen: true, isTeam: false })).toEqual([
      'dashboard', 'kitchen', 'calendar', 'bills', 'recipes',
    ])
  })

  it('admin sees every tab', () => {
    expect(getAllowedTabs({ isAdmin: true, isGuest: false, isKitchen: false, isTeam: false })).toEqual([
      'dashboard', 'kitchen', 'calendar', 'ask', 'bills', 'recipes', 'training', 'admin',
    ])
  })

  it('guest sees sales dashboard and sales-only ask', () => {
    expect(getAllowedTabs({ isAdmin: false, isGuest: true, isKitchen: false, isTeam: false })).toEqual(['dashboard', 'ask'])
  })

  it('a standard user sees the default set (no admin)', () => {
    expect(getAllowedTabs({ isAdmin: false, isGuest: false, isKitchen: false, isTeam: false })).toEqual([
      'dashboard', 'kitchen', 'calendar', 'ask', 'bills', 'recipes', 'training',
    ])
  })

  it('kitchen role takes precedence even if also admin', () => {
    expect(getAllowedTabs({ isAdmin: true, isGuest: false, isKitchen: true, isTeam: false })).toEqual([
      'dashboard', 'kitchen', 'calendar', 'bills', 'recipes',
    ])
  })

  it('team role can only see the team calendar', () => {
    expect(getAllowedTabs({ isAdmin: false, isGuest: true, isKitchen: false, isTeam: true })).toEqual(['calendar'])
  })
})

describe('getLandingHref', () => {
  it('lands a team user on the calendar in either workspace', () => {
    expect(getLandingHref(['calendar'])).toBe('/ops/calendar')
    expect(getLandingHref(['calendar'], 'v2')).toBe('/v2/calendar')
  })
})

describe('canManageTraining', () => {
  it('lets admins and shift managers run staff onboarding', () => {
    expect(canManageTraining({ isAdmin: true, isGuest: false, isKitchen: false, isTeam: false })).toBe(true)
    expect(canManageTraining({ isAdmin: false, isGuest: false, isKitchen: false, isTeam: false })).toBe(true)
  })

  it('keeps kitchen, guest and the calendar-only team login out', () => {
    expect(canManageTraining({ isAdmin: false, isGuest: false, isKitchen: true, isTeam: false })).toBe(false)
    expect(canManageTraining({ isAdmin: false, isGuest: true, isKitchen: false, isTeam: false })).toBe(false)
    expect(canManageTraining({ isAdmin: false, isGuest: true, isKitchen: false, isTeam: true })).toBe(false)
  })
})

describe('training tab placement', () => {
  it('never becomes anyone\u2019s landing page', () => {
    // getLandingHref takes the first allowed tab in ALL_TABS order, so Training
    // must sit after Dashboard or new starters' managers would land here.
    expect(getLandingHref(getAllowedTabs({ isAdmin: true, isGuest: false, isKitchen: false, isTeam: false }))).toBe('/ops')
    expect(getLandingHref(getAllowedTabs({ isAdmin: false, isGuest: false, isKitchen: false, isTeam: false }))).toBe('/ops')
  })

  it('routes to the matching page in each workspace', () => {
    expect(getLandingHref(['training'])).toBe('/ops/training')
    expect(getLandingHref(['training'], 'v2')).toBe('/v2/training')
  })
})
