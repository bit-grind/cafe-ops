import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  KountaSessionExpiredError,
  SyncRequestError,
  postSignedJson,
  requestKountaCsv,
  retryAfterMs,
  runLiveSample,
  withKountaSession,
} from './syncRequests.mjs'

const success = () => new Response(JSON.stringify({ ok: true, count: 1 }), { status: 200 })
const noWait = () => ({ sleepImpl: vi.fn().mockResolvedValue(undefined) })
const csv = { status: 200, url: 'https://my.kounta.com/report/salesummary', body: 'date,total\n2026-11-09,10' }

describe('transient export retries', () => {
  it('retries HTML server errors, rate limits and connection failures within one request budget', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 503, body: '<html>temporarily unavailable</html>' })
      .mockResolvedValueOnce({ status: 429, retryAfter: '3' })
      .mockResolvedValueOnce(csv)
    const options = noWait()
    await expect(requestKountaCsv(request, 'salesummary', options)).resolves.toBe(csv.body)
    expect(options.sleepImpl.mock.calls).toEqual([[1000], [3000]])
    expect(request).toHaveBeenCalledTimes(3)

    const disconnected = vi.fn().mockResolvedValue({ networkError: true })
    await expect(requestKountaCsv(disconnected, 'salesummary', noWait())).rejects.toMatchObject({ transient: true })
    expect(disconnected).toHaveBeenCalledTimes(3)
  })

  it.each([400, 404])('does not retry permanent HTTP %s responses', async (status) => {
    const request = vi.fn().mockResolvedValue({ status })
    await expect(requestKountaCsv(request, 'salesummary', noWait())).rejects.toMatchObject({ transient: false })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it.each([
    { status: 401 },
    { status: 403 },
    { status: 200, url: 'https://my.kounta.com/login', body: 'sign in' },
    { status: 200, body: '\n<!doctype html><html>sign in</html>' },
  ])('recognizes an expired session before interpreting a response as CSV: %j', async (response) => {
    const request = vi.fn().mockResolvedValue(response)
    await expect(requestKountaCsv(request, 'salesummary', noWait())).rejects.toBeInstanceOf(KountaSessionExpiredError)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('limits a session refresh to one login and preserves persistent auth failure', async () => {
    const reauthenticate = vi.fn().mockResolvedValue(undefined)
    const operation = vi.fn()
      .mockRejectedValueOnce(new KountaSessionExpiredError())
      .mockResolvedValueOnce(csv.body)
    await expect(withKountaSession(operation, reauthenticate)).resolves.toBe(csv.body)
    expect(reauthenticate).toHaveBeenCalledTimes(1)

    reauthenticate.mockClear()
    const stillExpired = vi.fn().mockRejectedValue(new KountaSessionExpiredError())
    await expect(withKountaSession(stillExpired, reauthenticate)).rejects.toBeInstanceOf(KountaSessionExpiredError)
    expect(reauthenticate).toHaveBeenCalledTimes(1)
    expect(stillExpired).toHaveBeenCalledTimes(2)
  })

  it('does not attempt a login for report validation failures', async () => {
    const reauthenticate = vi.fn()
    await expect(withKountaSession(() => Promise.reject(new Error('bad CSV')), reauthenticate)).rejects.toThrow('bad CSV')
    expect(reauthenticate).not.toHaveBeenCalled()
  })
})

describe('signed import retries', () => {
  const input = { appUrl: 'https://ops.example.invalid', path: '/api/import-daily', payload: [{ gross_sales: 10 }], secret: 'test-secret' }

  it('re-signs the same idempotent payload with a new nonce and timestamp after an uncertain response', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(success())
    let tick = 0
    let sequence = 0
    const now = () => Date.UTC(2026, 10, 8, 21) + tick++ * 1000
    await postSignedJson({ ...input, fetchImpl, now, nonce: () => `nonce-${++sequence}`, retryOptions: noWait() })
    const requests = fetchImpl.mock.calls.map(([, request]) => request)
    expect(requests).toHaveLength(3)
    expect(new Set(requests.map(r => r.headers['x-import-nonce'])).size).toBe(3)
    expect(new Set(requests.map(r => r.headers['x-import-timestamp'])).size).toBe(3)
    expect(new Set(requests.map(r => r.body)).size).toBe(1)
    for (const request of requests) {
      const signature = createHmac('sha256', input.secret)
        .update(`${request.headers['x-import-timestamp']}.${request.headers['x-import-nonce']}.${request.body}`)
        .digest('hex')
      expect(request.headers['x-import-signature']).toBe(signature)
      expect(request.signal).toBeInstanceOf(AbortSignal)
      expect(request.redirect).toBe('error')
    }
  })

  it.each([400, 401, 403, 413])('does not retry or expose a permanent HTTP %s response body', async (status) => {
    const fetchImpl = vi.fn().mockImplementation(() => new Response('private error detail', { status }))
    await expect(postSignedJson({ ...input, fetchImpl, retryOptions: noWait() }))
      .rejects.toThrow(`POST /api/import-daily returned HTTP ${status}`)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries timeouts and stops after three failed attempts', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException('private URL', 'TimeoutError'))
    await expect(postSignedJson({ ...input, fetchImpl, retryOptions: noWait() }))
      .rejects.toMatchObject({ transient: true, message: 'POST /api/import-daily timed out or lost its connection' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it.each(['<html>login</html>', '{"ok":false}', '{"count":1}'])('rejects an unconfirmed successful response: %s', async (body) => {
    const fetchImpl = vi.fn().mockImplementation(() => new Response(body, { status: 200 }))
    await expect(postSignedJson({ ...input, fetchImpl, retryOptions: noWait() })).rejects.toMatchObject({ transient: false })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('live sample recovery', () => {
  const outage = new SyncRequestError('temporary outage', { transient: true })

  it('keeps a browser after a temporary failure and resets the consecutive-failure count after recovery', async () => {
    const first = await runLiveSample(() => Promise.reject(outage), 0)
    expect(first).toMatchObject({ ok: false, consecutiveFailures: 1 })
    const second = await runLiveSample(() => Promise.reject(outage), first.consecutiveFailures)
    expect(second).toMatchObject({ ok: false, consecutiveFailures: 2 })
    const recovered = await runLiveSample(() => Promise.resolve('fresh sales'), second.consecutiveFailures)
    expect(recovered).toEqual({ ok: true, value: 'fresh sales', consecutiveFailures: 0 })
  })

  it('fails the job when three consecutive samples exhaust their retries', async () => {
    await expect(runLiveSample(() => Promise.reject(outage), 2)).rejects.toBe(outage)
  })

  it('does not swallow permanent input or authentication errors', async () => {
    await expect(runLiveSample(() => Promise.reject(new Error('invalid CSV')), 0)).rejects.toThrow('invalid CSV')
    await expect(runLiveSample(() => Promise.reject(new KountaSessionExpiredError()), 0))
      .rejects.toBeInstanceOf(KountaSessionExpiredError)
  })
})

describe('Retry-After bounds', () => {
  it('accepts seconds and HTTP dates but caps delays and ignores invalid/past values', () => {
    const now = Date.UTC(2026, 10, 9)
    expect(retryAfterMs('4', now)).toBe(4000)
    expect(retryAfterMs(new Date(now + 5000).toUTCString(), now)).toBe(5000)
    expect(retryAfterMs('3600', now)).toBe(15_000)
    expect(retryAfterMs('-1', now)).toBe(0)
    expect(retryAfterMs('nonsense', now)).toBe(0)
  })
})
