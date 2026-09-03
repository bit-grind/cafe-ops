import { describe, it, expect } from 'vitest'
import {
  buildInviteLink,
  generateTrainingToken,
  hashTrainingToken,
  isWellFormedToken,
  tokenHint,
} from '@/lib/training/traineeAuth'

describe('generateTrainingToken', () => {
  it('produces a 43-character base64url token', () => {
    const token = generateTrainingToken()
    expect(token).toHaveLength(43)
    expect(isWellFormedToken(token)).toBe(true)
  })

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateTrainingToken()))
    expect(tokens.size).toBe(200)
  })

  it('never contains characters that would need URL escaping', () => {
    for (let i = 0; i < 50; i++) {
      const token = generateTrainingToken()
      expect(encodeURIComponent(token)).toBe(token)
    }
  })
})

describe('isWellFormedToken', () => {
  it('rejects anything that is not exactly a token', () => {
    expect(isWellFormedToken('')).toBe(false)
    expect(isWellFormedToken('short')).toBe(false)
    expect(isWellFormedToken('a'.repeat(42))).toBe(false)
    expect(isWellFormedToken('a'.repeat(44))).toBe(false)
    // Padding and non-base64url characters are not tokens we ever issue.
    expect(isWellFormedToken('a'.repeat(42) + '=')).toBe(false)
    expect(isWellFormedToken('a'.repeat(42) + '/')).toBe(false)
    expect(isWellFormedToken('a'.repeat(42) + ' ')).toBe(false)
  })

  it('accepts the full base64url alphabet', () => {
    expect(isWellFormedToken('-_' + 'a'.repeat(41))).toBe(true)
  })
})

describe('hashTrainingToken', () => {
  it('is a stable 64-character hex digest', () => {
    const hash = hashTrainingToken('token')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hashTrainingToken('token')).toBe(hash)
  })

  it('differs for different tokens', () => {
    expect(hashTrainingToken('a')).not.toBe(hashTrainingToken('b'))
  })

  it('never returns the token itself', () => {
    const token = generateTrainingToken()
    expect(hashTrainingToken(token)).not.toContain(token)
  })
})

describe('tokenHint', () => {
  it('keeps only the last four characters', () => {
    const token = generateTrainingToken()
    expect(tokenHint(token)).toHaveLength(4)
    expect(token.endsWith(tokenHint(token))).toBe(true)
  })
})

describe('buildInviteLink', () => {
  it('puts the token in the fragment so it never reaches the server', () => {
    const link = buildInviteLink('https://ops.example.com', 'TOKEN')
    expect(link).toBe('https://ops.example.com/training#TOKEN')
    // Nothing before the '#' carries the secret.
    expect(link.split('#')[0]).not.toContain('TOKEN')
  })

  it('tolerates a trailing slash on the origin', () => {
    expect(buildInviteLink('https://ops.example.com/', 'TOKEN'))
      .toBe('https://ops.example.com/training#TOKEN')
  })
})
