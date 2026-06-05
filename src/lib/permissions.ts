export type AppTab = 'dashboard' | 'kitchen' | 'ask' | 'bills' | 'admin' | 'recipes'

export type SessionFlags = {
  isAdmin: boolean
  isGuest: boolean
  isKitchen: boolean
}

export const ALL_TABS: Array<{ label: string; tab: AppTab; href: string }> = [
  { label: 'Dashboard', tab: 'dashboard', href: '/ops' },
  { label: 'Kitchen', tab: 'kitchen', href: '/ops/kitchen' },
  { label: 'Ask AI', tab: 'ask', href: '/ops/ask' },
  { label: 'Suppliers', tab: 'bills', href: '/ops/bills' },
  { label: 'Recipes', tab: 'recipes', href: '/ops/recipes' },
  { label: 'Admin', tab: 'admin', href: '/ops/admin' },
]

export function getAllowedTabs({ isAdmin, isGuest, isKitchen }: SessionFlags): AppTab[] {
  if (isKitchen) return ['kitchen', 'bills', 'recipes']
  if (isAdmin) return ['dashboard', 'kitchen', 'ask', 'bills', 'recipes', 'admin']
  if (isGuest) return ['dashboard', 'ask']
  return ['dashboard', 'kitchen', 'ask', 'bills', 'recipes']
}
