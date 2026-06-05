import { describe, it, expect } from 'vitest'
import { getAllowedTabs } from '@/lib/permissions'

describe('getAllowedTabs', () => {
  it('kitchen sees kitchen, calendar, bills and recipes', () => {
    expect(getAllowedTabs({ isAdmin: false, isGuest: false, isKitchen: true })).toEqual(['kitchen', 'calendar', 'bills', 'recipes'])
  })

  it('admin sees every tab', () => {
    expect(getAllowedTabs({ isAdmin: true, isGuest: false, isKitchen: false })).toEqual([
      'dashboard', 'kitchen', 'calendar', 'ask', 'bills', 'recipes', 'admin',
    ])
  })

  it('guest sees sales dashboard and sales-only ask', () => {
    expect(getAllowedTabs({ isAdmin: false, isGuest: true, isKitchen: false })).toEqual(['dashboard', 'ask'])
  })

  it('a standard user sees the default set (no admin)', () => {
    expect(getAllowedTabs({ isAdmin: false, isGuest: false, isKitchen: false })).toEqual([
      'dashboard', 'kitchen', 'calendar', 'ask', 'bills', 'recipes',
    ])
  })

  it('kitchen role takes precedence even if also admin', () => {
    expect(getAllowedTabs({ isAdmin: true, isGuest: false, isKitchen: true })).toEqual(['kitchen', 'calendar', 'bills', 'recipes'])
  })
})
