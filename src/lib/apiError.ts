import { NextResponse } from 'next/server'

/**
 * Log the real error server-side and return a generic 500. Internal error
 * text (Xero response bodies, Supabase schema details) must never reach the
 * client — see AGENTS.md. Input-validation failures should keep returning
 * 400 with their specific message; this helper is only for unexpected
 * failures.
 */
export function internalError(context: string, error: unknown, publicMessage = 'Request failed'): NextResponse {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`${context}:`, message)
  return NextResponse.json({ error: publicMessage }, { status: 500 })
}
