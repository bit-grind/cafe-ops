import { createHmac, randomUUID } from 'crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { checkCronAuth, secureCompare, verifySignedImport } from '@/lib/serverAuth'

afterEach(() => {
  delete process.env.CRON_SECRET
  delete process.env.IMPORT_SECRET
})

describe('secureCompare', () => {
  it('compares secrets without throwing for different lengths', () => {
    expect(secureCompare('same', 'same')).toBe(true)
    expect(secureCompare('short', 'much-longer')).toBe(false)
  })
})

describe('checkCronAuth', () => {
  it('accepts a matching bearer token and rejects a wrong token', () => {
    process.env.CRON_SECRET = 'cron-secret'
    expect(checkCronAuth(new Request('https://example.com', {
      headers: { authorization: 'Bearer cron-secret' },
    }))).toBeNull()
    expect(checkCronAuth(new Request('https://example.com', {
      headers: { authorization: 'Bearer wrong' },
    }))?.status).toBe(401)
  })
})

describe('verifySignedImport', () => {
  it('accepts a fresh HMAC signature and rejects replay-window expiry', () => {
    process.env.IMPORT_SECRET = 'import-secret'
    const rawBody = '{"rows":[]}'
    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = randomUUID()
    const signature = createHmac('sha256', process.env.IMPORT_SECRET)
      .update(`${timestamp}.${nonce}.${rawBody}`)
      .digest('hex')
    const headers = {
      'x-import-timestamp': timestamp,
      'x-import-nonce': nonce,
      'x-import-signature': signature,
    }

    expect(verifySignedImport(new Request('https://example.com', { headers }), rawBody)).toEqual({ nonce })

    const expired = String(Number(timestamp) - 301)
    const expiredSignature = createHmac('sha256', process.env.IMPORT_SECRET)
      .update(`${expired}.${nonce}.${rawBody}`)
      .digest('hex')
    expect(verifySignedImport(new Request('https://example.com', {
      headers: { ...headers, 'x-import-timestamp': expired, 'x-import-signature': expiredSignature },
    }), rawBody)).toHaveProperty('status', 401)
  })
})
