import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/adminAuth'
import { listBillAttachments, getXeroConnection } from '@/lib/xero'

/**
 * GET /api/xero/bills/:id/attachments — list the attachments stored on a bill
 * in Xero. Returns metadata only (filename, mime, size). The bytes themselves
 * are streamed via /api/xero/bills/:id/attachments/:fileName.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const conn = await getXeroConnection()
    if (!conn) return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const attachments = await listBillAttachments(id)
    return NextResponse.json({ attachments })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
