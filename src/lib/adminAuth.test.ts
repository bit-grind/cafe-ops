import { afterEach, describe, expect, it } from 'vitest'
import { isTeamEmail, normalizeAppRole } from '@/lib/adminAuth'

afterEach(() => {
  delete process.env.TEAM_LOGIN_EMAIL
})

describe('normalizeAppRole', () => {
  it('recognizes the calendar-only team role', () => {
    expect(normalizeAppRole('team')).toBe('team')
  })

  it('keeps unknown roles at least privilege', () => {
    expect(normalizeAppRole('owner')).toBe('guest')
  })
})

describe('isTeamEmail', () => {
  it('only matches the server-configured team account', () => {
    process.env.TEAM_LOGIN_EMAIL = 'team@example.invalid'
    expect(isTeamEmail('team@example.invalid')).toBe(true)
    expect(isTeamEmail('other@example.invalid')).toBe(false)
  })
})
