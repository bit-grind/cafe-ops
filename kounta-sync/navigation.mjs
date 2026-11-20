import { SyncRequestError, withTransientRetry } from './syncRequests.mjs'

/** Exports need a loaded document, not silence from analytics/background requests. */
export async function navigateKounta(page, url, retryOptions = {}) {
  return withTransientRetry(async () => {
    let response
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    } catch (error) {
      if (error?.name !== 'TimeoutError'
        && !/net::ERR_(?:CONNECTION_RESET|CONNECTION_CLOSED|TIMED_OUT|NETWORK_CHANGED)\b/.test(error?.message ?? '')) throw error
      throw new SyncRequestError('Kounta navigation timed out or lost its connection', { transient: true })
    }
    const status = response?.status()
    if (!status || status < 200 || status >= 400) {
      throw new SyncRequestError(`Kounta navigation returned HTTP ${status ?? 'unknown'}`, {
        transient: status === 408 || status === 429 || status >= 500 && status <= 599,
      })
    }
    return response
  }, retryOptions)
}
