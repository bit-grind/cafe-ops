import { createHmac, randomUUID } from 'node:crypto'

const REQUEST_TIMEOUT_MS = 30_000
const MAX_RETRY_DELAY_MS = 15_000
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export class SyncRequestError extends Error {
  constructor(message, { transient = false, retryAfterMs = 0 } = {}) {
    super(message)
    this.name = 'SyncRequestError'
    this.transient = transient
    this.retryAfterMs = retryAfterMs
  }
}

export class KountaSessionExpiredError extends Error {
  constructor() {
    super('Kounta session expired')
    this.name = 'KountaSessionExpiredError'
  }
}

export function isTransientSyncError(error) {
  return error instanceof SyncRequestError && error.transient
}

function transientStatus(status) {
  return status === 408 || status === 429 || status >= 500 && status <= 599
}

export function retryAfterMs(value, nowMs = Date.now()) {
  if (!value) return 0
  const seconds = Number(value)
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - nowMs
  return Number.isFinite(delay) ? Math.max(0, Math.min(delay, MAX_RETRY_DELAY_MS)) : 0
}

/** Retry only known transport/server failures; malformed input and auth stay strict. */
export async function withTransientRetry(operation, {
  attempts = 3,
  sleepImpl = sleep,
  onRetry = () => {},
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (!isTransientSyncError(error) || attempt === attempts) throw error
      const delayMs = Math.max(1000 * 2 ** (attempt - 1), error.retryAfterMs)
      onRetry({ attempt, attempts, error, delayMs })
      await sleepImpl(Math.min(delayMs, MAX_RETRY_DELAY_MS))
    }
  }
  throw new Error('Retry attempts must be positive')
}

function isTransportError(error) {
  return error instanceof TypeError
    || ['AbortError', 'TimeoutError'].includes(error?.name)
    || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH']
      .includes(error?.code ?? error?.cause?.code)
}

/** The browser callback returns data, not an exception containing a report URL. */
export async function requestKountaCsv(request, report, retryOptions = {}) {
  return withTransientRetry(async () => {
    const response = await request()
    if (response.networkError) {
      throw new SyncRequestError(`Kounta ${report} request timed out or lost its connection`, { transient: true })
    }
    if (response.status === 401 || response.status === 403
      || response.status === 200 && (/\/(?:login|signin|sign-in|auth)(?:[/?#]|$)/i.test(response.url ?? '')
        || /^\s*(?:<!doctype\s+html|<html\b)/i.test(response.body ?? ''))) {
      throw new KountaSessionExpiredError()
    }
    if (response.status !== 200) {
      throw new SyncRequestError(`Kounta ${report} export returned HTTP ${response.status}`, {
        transient: transientStatus(response.status),
        retryAfterMs: retryAfterMs(response.retryAfter),
      })
    }
    return response.body
  }, retryOptions)
}

/** Reauthenticate once; a wrong password or changed login form must still fail. */
export async function withKountaSession(operation, reauthenticate) {
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof KountaSessionExpiredError)) throw error
    await reauthenticate()
    return operation()
  }
}

/** A lost response may have committed already, so each retry gets a new nonce. */
export async function postSignedJson({
  appUrl,
  path,
  payload,
  secret,
  fetchImpl = fetch,
  now = Date.now,
  nonce = randomUUID,
  retryOptions = {},
}) {
  const body = JSON.stringify(payload)
  return withTransientRetry(async () => {
    const timestamp = String(Math.floor(now() / 1000))
    const requestNonce = nonce()
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${requestNonce}.${body}`)
      .digest('hex')
    let response
    let responseBody
    try {
      response = await fetchImpl(`${appUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-import-timestamp': timestamp,
          'x-import-nonce': requestNonce,
          'x-import-signature': signature,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'error',
      })
      responseBody = await response.text()
    } catch (error) {
      if (!isTransportError(error)) throw error
      throw new SyncRequestError(`POST ${path} timed out or lost its connection`, { transient: true })
    }
    if (!response.ok) {
      throw new SyncRequestError(`POST ${path} returned HTTP ${response.status}`, {
        transient: transientStatus(response.status),
        retryAfterMs: retryAfterMs(response.headers.get('retry-after'), now()),
      })
    }
    let result
    try { result = JSON.parse(responseBody) } catch {
      throw new SyncRequestError(`POST ${path} returned invalid JSON`)
    }
    if (result?.ok !== true) throw new SyncRequestError(`POST ${path} did not confirm a successful import`)
    return responseBody
  }, retryOptions)
}

/** A brief outage should not discard the logged-in browser; persistent failure must fail the job. */
export async function runLiveSample(operation, consecutiveFailures, maxFailures = 3) {
  try {
    return { ok: true, value: await operation(), consecutiveFailures: 0 }
  } catch (error) {
    const failures = consecutiveFailures + 1
    if (!isTransientSyncError(error) || failures >= maxFailures) throw error
    return { ok: false, error, consecutiveFailures: failures }
  }
}
