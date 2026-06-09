import { describe, expect, it, vi } from 'vitest'
import { internalError } from '@/lib/apiError'

describe('internalError', () => {
  it('returns a generic 500 and never echoes the internal message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = internalError('Bills list failed', new Error('relation "xero_bill_cache" does not exist'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Request failed' })
    expect(spy).toHaveBeenCalledWith('Bills list failed:', 'relation "xero_bill_cache" does not exist')
    spy.mockRestore()
  })

  it('supports a route-specific public message and non-Error values', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = internalError('Brief load failed', 'boom', 'Failed to load brief')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to load brief' })
    spy.mockRestore()
  })
})
