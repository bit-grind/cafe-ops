import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/adminAuth'
import { fetchBillAttachment, getXeroConnection } from '@/lib/xero'

/**
 * GET /api/xero/bills/:id/attachments/:fileName — proxies the actual
 * attachment bytes from Xero so the browser can render the original supplier
 * invoice (PDF / image / etc.) inline. Streams whatever content-type Xero
 * returns straight back to the client.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; fileName: string }> }
) {
  try {
    const session = await getSessionUser(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.isGuest) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const conn = await getXeroConnection()
    if (!conn) return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })

    const { id, fileName } = await params
    if (!id || !fileName) return NextResponse.json({ error: 'Missing id or fileName' }, { status: 400 })

    // Next.js URL-decodes route params, so fileName arrives in its original form.
    const result = await fetchBillAttachment(id, fileName)
    if (!result) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

    const safeInlineTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
    const inline = safeInlineTypes.has(result.contentType.toLowerCase())
    const cleanFileName = fileName.replace(/[\r\n"]/g, '')
    return new NextResponse(result.buffer, {
      status: 200,
      headers: {
        'Content-Type': inline ? result.contentType : 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${cleanFileName}"`,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
