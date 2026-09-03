export type AppTab = 'dashboard' | 'kitchen' | 'calendar' | 'ask' | 'bills' | 'admin' | 'recipes' | 'training'

export type SessionFlags = {
  isAdmin: boolean
  isGuest: boolean
  isKitchen: boolean
  isTeam: boolean
}

export const ALL_TABS: Array<{ label: string; tab: AppTab; href: string }> = [
  { label: 'Dashboard', tab: 'dashboard', href: '/ops' },
  { label: 'Kitchen', tab: 'kitchen', href: '/ops/kitchen' },
  { label: 'Team Calendar', tab: 'calendar', href: '/ops/calendar' },
  { label: 'Ask AI', tab: 'ask', href: '/ops/ask' },
  { label: 'Suppliers', tab: 'bills', href: '/ops/bills' },
  { label: 'Recipes', tab: 'recipes', href: '/ops/recipes' },
  { label: 'Training', tab: 'training', href: '/ops/training' },
  { label: 'Admin', tab: 'admin', href: '/ops/admin' },
]

export function getAllowedTabs({ isAdmin, isGuest, isKitchen, isTeam }: SessionFlags): AppTab[] {
  if (isTeam) return ['calendar']
  if (isKitchen) return ['dashboard', 'kitchen', 'calendar', 'bills', 'recipes']
  if (isAdmin) return ['dashboard', 'kitchen', 'calendar', 'ask', 'bills', 'recipes', 'training', 'admin']
  if (isGuest) return ['dashboard', 'ask']
  return ['dashboard', 'kitchen', 'calendar', 'ask', 'bills', 'recipes', 'training']
}

/**
 * Staff onboarding is managed by admins and shift managers only — kitchen,
 * guest and the calendar-only team login are excluded. Derived from
 * `getAllowedTabs` so the tab and the API can never disagree.
 */
export function canManageTraining(flags: SessionFlags): boolean {
  return getAllowedTabs(flags).includes('training')
}

export function getLandingHref(allowedTabs: AppTab[], workspace: 'ops' | 'v2' = 'ops'): string {
  const first = ALL_TABS.find(({ tab }) => allowedTabs.includes(tab))
  if (!first) return '/login'
  if (workspace === 'ops') return first.href
  return first.tab === 'dashboard' ? '/v2' : `/v2/${first.tab}`
}
