import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/adminAuth'

const IMPORT_MAX_AGE_SECONDS = 5 * 60
const NONCE_RE = /^[a-f0-9-]{36}$/i

export function secureCompare(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function checkCronAuth(req: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET
  if (!expected) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  const authorization = req.headers.get('authorization')
  const provided = req.headers.get('x-cron-secret')
    ?? (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
  if (!provided || !secureCompare(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export type SignedImport = { nonce: string }

export function verifySignedImport(req: Request, rawBody: string): SignedImport | NextResponse {
  const secret = process.env.IMPORT_SECRET
  if (!secret) return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 })

  const timestamp = req.headers.get('x-import-timestamp') ?? ''
  const nonce = req.headers.get('x-import-nonce') ?? ''
  const signature = req.headers.get('x-import-signature') ?? ''
  const epoch = Number(timestamp)
  if (!Number.isInteger(epoch) || Math.abs(Math.floor(Date.now() / 1000) - epoch) > IMPORT_MAX_AGE_SECONDS) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (!NONCE_RE.test(nonce) || !/^[a-f0-9]{64}$/i.test(signature)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.${rawBody}`)
    .digest('hex')
  if (!secureCompare(signature, expected)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  return { nonce }
}

export async function consumeImportNonce(nonce: string): Promise<boolean> {
  const { data, error } = await adminClient().rpc('consume_import_nonce', { p_nonce: nonce })
  if (error) throw new Error(`Import nonce check failed: ${error.message}`)
  return data === true
}

export async function consumeRateLimit(
  scope: string,
  key: string,
  options: { windowSeconds: number; limit: number },
): Promise<boolean> {
  const digest = createHmac('sha256', process.env.RATE_LIMIT_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'missing')
    .update(key)
    .digest('hex')
  const { data, error } = await adminClient().rpc('consume_rate_limit', {
    p_scope: scope,
    p_key_hash: digest,
    p_window_seconds: options.windowSeconds,
    p_limit: options.limit,
  })
  if (error) throw new Error(`Rate limit check failed: ${error.message}`)
  return data === true
}
