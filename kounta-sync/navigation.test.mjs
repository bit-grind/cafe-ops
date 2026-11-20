import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { navigateKounta } from './navigation.mjs'

const url = 'https://my.kounta.com/report/salesummary'
const response = status => ({ status: () => status })
const options = () => ({ sleepImpl: vi.fn().mockResolvedValue(), onRetry: vi.fn() })

describe('Kounta document navigation', () => {
  it('waits for the document rather than unrelated network silence', async () => {
    const page = { goto: vi.fn().mockResolvedValue(response(200)) }
    await navigateKounta(page, url)
    expect(page.goto).toHaveBeenCalledExactlyOnceWith(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  })
  it.each(['TimeoutError', 'network'])('recovers a transient %s failure', async name => {
    const error = Object.assign(new Error(name === 'network' ? 'net::ERR_CONNECTION_RESET' : 'timeout'), { name })
    const page = { goto: vi.fn().mockRejectedValueOnce(error).mockResolvedValue(response(200)) }
    const retry = options()
    await navigateKounta(page, url, retry)
    expect(page.goto).toHaveBeenCalledTimes(2)
    expect(retry.sleepImpl).toHaveBeenCalledWith(1000)
  })
  it.each([408, 429, 500, 503])('retries transient HTTP %s', async status => {
    const page = { goto: vi.fn().mockResolvedValueOnce(response(status)).mockResolvedValue(response(200)) }
    await navigateKounta(page, url, options())
    expect(page.goto).toHaveBeenCalledTimes(2)
  })
  it.each([401, 403, 404])('does not disguise HTTP %s as success or retry it', async status => {
    const page = { goto: vi.fn().mockResolvedValue(response(status)) }
    await expect(navigateKounta(page, url, options())).rejects.toThrow(`HTTP ${status}`)
    expect(page.goto).toHaveBeenCalledTimes(1)
  })
  it('stops after three failed attempts and retains failure', async () => {
    const page = { goto: vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' })) }
    const retry = options()
    await expect(navigateKounta(page, url, retry)).rejects.toThrow('timed out')
    expect(page.goto).toHaveBeenCalledTimes(3)
    expect(retry.sleepImpl.mock.calls).toEqual([[1000], [2000]])
  })
  it('does not retry programming or certificate errors', async () => {
    for (const error of [new Error('bug'), new Error('net::ERR_CERT_AUTHORITY_INVALID')]) {
      const page = { goto: vi.fn().mockRejectedValue(error) }
      await expect(navigateKounta(page, url, options())).rejects.toBe(error)
      expect(page.goto).toHaveBeenCalledTimes(1)
    }
  })
  it('keeps login redirect rejection and uses document readiness throughout login', () => {
    const source = readFileSync(new URL('./sync.mjs', import.meta.url), 'utf8')
    expect(source).not.toContain("waitUntil: 'networkidle'")
    expect(source).toContain("navigateKounta(page, 'https://my.kounta.com/report/salesummary', retryOptions)")
    expect(source).toContain("throw new Error('Login failed — still on ' + page.url())")
  })
})
