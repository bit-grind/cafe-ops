import { describe, it, expect } from 'vitest'
import { getAllowedTabs, getLandingHref } from '@/lib/permissions'

describe('getAllowedTabs', () => {
  it('kitchen sees its limited dashboard, full team calendar, suppliers and recipes', () => {
    expect(getAllowedTabs({ isAdmin: false, isGuest: false, isKitchen: true, isTeam: false })).toEqual([
      'dashboard', 'kitchen', 'calendar', 'bills', 'recipes',
    ])
  })

  it('admin sees every tab', () => {
    expect(getAllowedTabs({ isAdmin: true, isGuest: false, isKitchen: false, isTeam: false })).toEqual([
      'dashboard', 'kitchen', 'calendar', 'ask', 'bills', 'recipes', 'admin',
    ])
  })

  it('guest sees sales dashboard and sales-only ask', () => {
    expect(getAllowedTabs({ isAdmin: false, isGuest: true, isKitchen: false, isTeam: false })).toEqual(['dashboard', 'ask'])
  })

  it('a standard user sees the default set (no admin)', () => {
    expect(getAllowedTabs({ isAdmin: false, isGuest: false, isKitchen: false, isTeam: false })).toEqual([
      'dashboard', 'kitchen', 'calendar', 'ask', 'bills', 'recipes',
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
